import { DateTime } from "@/lib/fecha";
import type { ReminderFreq, ReminderKind } from "@/types/database";

import type { ReminderRule } from "./rule";

/**
 * El lector de frases de recordatorios. Sin IA: reglas fijas y probadas.
 *
 * «recuérdame todos los días a las 8 revisar el precio del crudo» → todos los
 * días, 08:00, «Revisar el precio del crudo». Lo mismo dictado con el
 * micrófono del teclado («recuerdame todos los dias a las 8…»).
 *
 * Sólo traduce palabras a una regla. **Cuándo** suena lo calcula la base
 * (`recordatorio_siguiente`); aquí sólo se resuelven las fechas que la frase
 * nombra («mañana», «el jueves», «el 15», «en 2 horas»), con el «ahora» y la
 * zona del dueño.
 *
 * Existe dos veces, aquí y en el bot (`reminders/parse.js` del agente), y las
 * dos leen el mismo banco de frases con lo que debe salir
 * (`docs/recordatorios-frases.json`). Así no pueden entender cosas distintas.
 *
 * Las decisiones de lectura, todas en el banco con su frase:
 * - Sin hora, las 09:00 (y «Tu día», las 07:30). Con sólo una parte del día:
 *   mañana 09:00, mediodía 12:00, tarde 16:00, noche 20:00, temprano 08:00.
 * - Una hora suelta de 1 a 6 es de la tarde («a las 3» = 15:00); de 7 a 12, de
 *   la mañana. «de la noche» con 1–5 es de madrugada.
 * - Un día de la semana suelto («el jueves») es el próximo, nunca hoy.
 * - «el 15» es el próximo 15 (este mes si no ha pasado). Un 31 en un mes de 30
 *   salta al siguiente mes que lo tenga.
 * - Sólo hora («a las 5 llamar a Ana»): hoy si no ha pasado, si no mañana.
 * - «cada N días» empieza hoy si la hora no ha pasado, si no mañana.
 * - «recuérdale a…» no es un recordatorio tuyo: es un mensaje a otra persona,
 *   y eso lo hace el bot con tu «sí».
 */

export interface ParsedReminder {
  rule: ReminderRule;
  /** La hora la dijo él (o «en 2 horas»): si cae de noche, suena igual. */
  timeSaid: boolean;
  kind: ReminderKind;
  /** Lo que hay que recordar. Vacío en los «vivos». */
  text: string;
  /** El proyecto tal y como lo dijo («petróleo») en «qué falta en…» / «cómo va…». */
  project: string | null;
  /** Si la frase llevaba «recuérdame» o parecido. */
  trigger: boolean;
}

export type ParseFailure = "VACIO" | "SIN_CUANDO" | "SIN_QUE" | "A_OTRO" | "NO_SE";

export type ParseResult = { ok: true; value: ParsedReminder } | { ok: false; reason: ParseFailure };

export interface ParseContext {
  /** El instante de referencia. */
  now: Date;
  /** La zona del dueño (IANA). */
  tz: string;
}

/** Por qué no se entendió, en palabras para la pantalla. */
export const PARSE_FAILURE_TEXT: Record<ParseFailure, string> = {
  VACIO: "Escribe qué te recuerdo y cuándo.",
  SIN_CUANDO: "¿Cuándo? Por ejemplo «mañana a las 9» o «todos los lunes».",
  SIN_QUE: "¿Qué te recuerdo? Por ejemplo «llamar a Ana».",
  A_OTRO: "Recordarle algo a otra persona lo hace el bot: díselo en «🤖 Mi bot».",
  NO_SE: "No entendí cuándo. Prueba con «cada 2 días» o «el 15 de cada mes».",
};

// --------------------------------------------------------------- utilidades

/** Minúsculas y sin tildes, carácter a carácter (mismo largo que el original). */
function normaliza(texto: string): string {
  // Unidad a unidad (UTF-16), no carácter a carácter: así un emoji ocupa lo
  // mismo en los dos y las posiciones del uno valen para el otro.
  let out = "";
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    out += base.length === 1 ? base : ch;
  }
  return out;
}

const NUMEROS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  primero: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  "treinta y uno": 31,
  "treinta y un": 31,
  cuarenta: 40,
  "cuarenta y cinco": 45,
  cincuenta: 50,
};

const PALABRA_NUM =
  "treinta y uno|treinta y un|cuarenta y cinco|cero|uno|una|un|primero|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veintiuno|veintiun|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve|veinte|treinta|cuarenta|cincuenta";

function num(texto: string | undefined): number | null {
  if (texto === undefined) return null;
  const t = texto.trim();
  if (/^\d+$/.test(t)) return Number(t);
  return NUMEROS[t] ?? null;
}

const DIAS: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sabados: 6,
  domingo: 7,
  domingos: 7,
};
const DIA = "lunes|martes|miercoles|jueves|viernes|sabados|sabado|domingos|domingo";
const DIA_SINGULAR = "lunes|martes|miercoles|jueves|viernes|sabado|domingo";

const MESES: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sept: 9,
  sep: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};
const MES =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic";

type Periodo = "manana" | "mediodia" | "tarde" | "noche" | "madrugada" | "am" | "pm";

const HORA_DE_PERIODO: Record<"manana" | "mediodia" | "tarde" | "noche" | "temprano", string> = {
  manana: "09:00",
  mediodia: "12:00",
  tarde: "16:00",
  noche: "20:00",
  temprano: "08:00",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** La hora de verdad según la parte del día («3 de la tarde» = 15). */
function ajustaHora(h: number, periodo: Periodo | null): number {
  switch (periodo) {
    case "pm":
    case "tarde":
      return h < 12 ? h + 12 : h;
    case "am":
    case "madrugada":
      return h === 12 ? 0 : h;
    case "manana":
      return h;
    case "mediodia":
      return h < 12 && h <= 3 ? h + 12 : h;
    case "noche":
      if (h === 12) return 0;
      return h >= 6 && h < 12 ? h + 12 : h;
    default:
      // Una hora suelta de 1 a 6 es de la tarde: nadie pone un recordatorio
      // a las 3 de la madrugada sin decirlo.
      return h >= 1 && h <= 6 ? h + 12 : h;
  }
}

function periodoDe(texto: string | undefined): Periodo | null {
  if (!texto) return null;
  const t = texto.replace(/[\s.]/g, "");
  if (t === "am") return "am";
  if (t === "pm") return "pm";
  if (t === "manana") return "manana";
  if (t === "tarde") return "tarde";
  if (t === "noche") return "noche";
  if (t === "madrugada") return "madrugada";
  if (t === "mediodia") return "mediodia";
  return null;
}

/**
 * Lo que queda por leer. Lo que ya se entendió se borra (se cambia por
 * espacios) para que nada lo lea dos veces, y las posiciones siguen valiendo
 * para recortar el texto original.
 */
class Frase {
  readonly original: string;
  private trabajo: string;

  constructor(texto: string) {
    this.original = texto;
    this.trabajo = normaliza(texto);
  }

  /** Busca y, si encuentra, lo quita. */
  toma(re: RegExp): RegExpExecArray | null {
    const m = new RegExp(re.source, re.flags.replace("g", "")).exec(this.trabajo);
    if (!m) return null;
    this.borra(m.index, m.index + m[0].length);
    return m;
  }

  /** Busca sin quitar. */
  mira(re: RegExp): RegExpExecArray | null {
    return new RegExp(re.source, re.flags.replace("g", "")).exec(this.trabajo);
  }

  borra(desde: number, hasta: number) {
    this.trabajo = this.trabajo.slice(0, desde) + " ".repeat(hasta - desde) + this.trabajo.slice(hasta);
  }

  /** Lo que queda, en normalizado. */
  get resto(): string {
    return this.trabajo;
  }

  /** Lo que queda, con sus mayúsculas y tildes. */
  get restoOriginal(): string {
    let out = "";
    for (let i = 0; i < this.original.length; i += 1) {
      const ch = this.original[i];
      out += this.trabajo[i] === " " && ch !== " " ? " " : ch;
    }
    return out;
  }
}

// ------------------------------------------------------------------ el lector

export function parseReminder(input: string, ctx: ParseContext): ParseResult {
  const limpio = input.replace(/\s+/g, " ").trim();
  if (limpio === "") return { ok: false, reason: "VACIO" };

  const f = new Frase(limpio);
  const ahora = DateTime.fromJSDate(ctx.now).setZone(ctx.tz);
  const hoy = ahora.startOf("day");

  // Un recordatorio para otra persona es un mensaje: lo hace el bot con tu «sí».
  if (f.mira(/\b(recuerdale|recuerdales|recordarle|recordarles|avisale|avisales|dile a|digale a)\b/)) {
    return { ok: false, reason: "A_OTRO" };
  }

  // Lo que se dice por cortesía o al dictar no es parte de lo que hay que recordar.
  while (f.toma(/^\s*(?:oye|oiga|ey|hey|hola|bot|porfa|porfis|plis|por favor)\b[\s,]*/)) {
    // nada: sólo se quita
  }
  f.toma(/[\s,]*\b(?:por favor|porfa|porfis|plis)\s*[.!]?\s*$/);

  // ------------------------------------------------------------- «recuérdame»
  // «recordatorio diario: …» es a la vez la orden y la regla.
  const recordatorioDiario = f.toma(/\b(?:un |nuevo )?recordatorio diario(?: para| de)?\b\s*:?/) !== null;
  const trigger =
    recordatorioDiario ||
    f.toma(
      /\b(?:recuerdamelo|recuerdame|recordarme|recordame|acuerdame|avisame|hazme acordar|que no se me olvide|no me dejes olvidar|no dejes que se me olvide|(?:ponme|pon|crea|creame|anota|apunta) un recordatorio(?: para)?|(?:nuevo )?recordatorio(?: para)?)\b\s*:?/,
    ) !== null;

  let freq: ReminderFreq | null = null;
  let days: number[] = [];
  let monthday: number | null = null;
  let everyN: number | null = null;
  let onDate: DateTime | null = null;
  let untilDate: DateTime | null = null;
  let hora: { h: number; m: number } | null = null;
  let horaFija: string | null = null;
  let periodo: Periodo | null = null;
  let periodoDeRegla: Periodo | null = null;
  let timeSaid = false;
  let mensualSinDia = false;
  let semanalSinDia = false;

  // ------------------------------------------------------------------ hasta
  const hastaRe = new RegExp(
    `\\bhasta (?:el )?(?:dia )?(\\d{1,2}|${PALABRA_NUM}) de (${MES})(?: (?:de|del) (\\d{4}))?\\b`,
  );
  const hasta = f.toma(hastaRe);
  if (hasta) {
    untilDate = fechaDeDiaYMes(num(hasta[1]), MESES[hasta[2]], hasta[3] ? Number(hasta[3]) : null, hoy);
    if (!untilDate) return { ok: false, reason: "NO_SE" };
  } else {
    const hastaFin = f.toma(/\bhasta (?:el )?(?:fin|final) de(?:l)? (?:mes|ano)\b/);
    const hastaDia = hastaFin
      ? null
      : f.toma(new RegExp(`\\bhasta (?:el )?(?:dia )?(\\d{1,2}|${PALABRA_NUM})\\b(?!\\s*(?::|h\\b|am\\b|pm\\b|de la))`));
    if (hastaFin) {
      untilDate = hastaFin[0].includes("mes") ? hoy.endOf("month").startOf("day") : hoy.endOf("year").startOf("day");
    } else if (hastaDia) {
      const n = num(hastaDia[1]);
      untilDate = n === null ? null : proximoDia(n, hoy);
      if (!untilDate) return { ok: false, reason: "NO_SE" };
    }
  }

  // ------------------------------------------------------------- en 2 horas
  const rel = f.toma(
    new RegExp(
      `\\b(?:en|dentro de)\\s+(\\d+|${PALABRA_NUM}|media)\\s*(?:(y media)\\s+)?(minutos|minuto|mins|min|horas|hora|hrs|hr|h|dias|dia|semanas|semana)(?:\\s+y\\s+media)?\\b`,
    ),
  );
  const relMedia = rel ? null : f.toma(/\ben (?:una|un) hora y media\b|\ben hora y media\b/);
  const relRato = rel || relMedia ? null : f.toma(/\ben un rato\b|\ben un ratito\b/);
  if (rel || relMedia || relRato) {
    let minutos = 0;
    let diasRel = 0;
    if (relMedia) minutos = 90;
    else if (relRato) minutos = 30;
    else if (rel) {
      const cantidad = rel[1] === "media" ? 0.5 : num(rel[1]);
      if (cantidad === null) return { ok: false, reason: "NO_SE" };
      const unidad = rel[3];
      const extra = rel[2] || /y media\s*$/.test(rel[0]) ? 0.5 : 0;
      if (unidad.startsWith("min")) minutos = cantidad;
      else if (unidad.startsWith("h")) minutos = (cantidad + extra) * 60;
      else if (unidad.startsWith("dia")) diasRel = cantidad;
      else if (unidad.startsWith("semana")) diasRel = cantidad * 7;
    }
    freq = "UNA_VEZ";
    if (minutos > 0) {
      const cuando = ahora.plus({ minutes: Math.round(minutos) }).startOf("minute");
      onDate = cuando.startOf("day");
      hora = { h: cuando.hour, m: cuando.minute };
      timeSaid = true;
    } else {
      onDate = hoy.plus({ days: diasRel });
    }
  }

  // -------------------------------------------------------------- repetición
  if (!freq) {
    const cadaN = f.toma(new RegExp(`\\bcada\\s+(\\d+|${PALABRA_NUM})\\s+(dias|semanas|meses)\\b`));
    if (cadaN) {
      const n = num(cadaN[1]);
      if (n === null || n < 1) return { ok: false, reason: "NO_SE" };
      if (cadaN[2] === "meses") {
        if (n !== 1) return { ok: false, reason: "NO_SE" };
        freq = "MENSUAL";
        mensualSinDia = true;
      } else {
        const total = cadaN[2] === "semanas" ? n * 7 : n;
        if (total > 365) return { ok: false, reason: "NO_SE" };
        if (total === 1) freq = "DIARIO";
        else if (n === 1 && cadaN[2] === "semanas") {
          freq = "SEMANAL";
          semanalSinDia = true;
        } else {
          freq = "CADA_N_DIAS";
          everyN = total;
        }
      }
    } else if (f.toma(/\b(?:cada otro dia|un dia si y (?:otro|un dia) no|dia (?:por|de) medio|en dias alternos)\b/)) {
      freq = "CADA_N_DIAS";
      everyN = 2;
    } else if (f.toma(/\b(?:quincenalmente|cada quincena)\b/)) {
      freq = "CADA_N_DIAS";
      everyN = 14;
    } else if (f.toma(/\bcada (?:hora|minuto)s?\b/)) {
      return { ok: false, reason: "NO_SE" };
    }
  }

  if (!freq) {
    if (f.toma(/\b(?:los |cada |todos los |en )?fin(?:es)? de semana\b/)) {
      freq = "SEMANAL";
      days = [6, 7];
    }
  }

  if (!freq) {
    // De lunes a jueves.
    const rango = f.toma(new RegExp(`\\bde (${DIA_SINGULAR}) a (${DIA_SINGULAR})\\b`));
    if (rango) {
      const a = DIAS[rango[1]];
      const b = DIAS[rango[2]];
      if (a === 1 && b === 5) freq = "LABORABLES";
      else {
        freq = "SEMANAL";
        days = (a <= b ? range(a, b) : [...range(a, 7), ...range(1, b)]).sort((x, y) => x - y);
      }
    }
  }

  if (!freq) {
    if (
      f.toma(
        /\b(?:entre semana|de lunes a viernes|(?:todos )?los dias (?:laborables|habiles|de semana|de trabajo|entre semana)|(?:cada |los |en )?dias? (?:laborables?|habiles?)|en dias de semana|cada dia laborable)\b/,
      )
    ) {
      freq = "LABORABLES";
    }
  }

  if (!freq) {
    const diario = f.toma(
      /\b(?:todos los dias de la semana|cada dia de la semana|todos los dias|todo los dias|todos los santos dias|cada dia|a diario|diariamente|todas las (mananas|tardes|noches)|cada (manana|tarde|noche))\b/,
    );
    if (diario || recordatorioDiario) {
      freq = "DIARIO";
      const parte = (diario?.[1] ?? diario?.[2] ?? "").replace(/s$/, "").replace("mananas", "manana");
      periodoDeRegla = periodoDe(parte === "manana" ? "manana" : parte);
    }
  }

  if (!freq) {
    // Los lunes; cada martes y jueves; todos los lunes, miércoles y viernes;
    // sábados y domingos.
    const semanal = f.toma(
      new RegExp(
        `\\b(?:(?:cada|todos los|todas las|los)\\s+(${DIA})|(sabados|domingos))((?:\\s*(?:,|y|e)\\s*(?:los\\s+|cada\\s+)?(?:${DIA}))*)\\b`,
      ),
    );
    if (semanal) {
      freq = "SEMANAL";
      const nombres = [semanal[1] ?? semanal[2], ...((semanal[3] ?? "").match(new RegExp(DIA, "g")) ?? [])];
      days = [...new Set(nombres.map((n) => DIAS[n]).filter((d): d is number => d !== undefined))].sort((x, y) => x - y);
    }
  }

  if (!freq) {
    if (f.toma(/\b(?:cada semana|todas las semanas|semanalmente|una vez (?:a la|por) semana)\b/)) {
      freq = "SEMANAL";
      semanalSinDia = true;
    }
  }

  if (!freq) {
    const mensualDia =
      f.toma(new RegExp(`\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2}|${PALABRA_NUM})\\s+de\\s+(?:cada|todos los)\\s+mes(?:es)?\\b`)) ??
      f.toma(new RegExp(`\\b(?:cada|todos los)\\s+mes(?:es)?\\s+(?:el\\s+)?(?:dia\\s+)?(\\d{1,2}|${PALABRA_NUM})\\b`)) ??
      f.toma(new RegExp(`\\bcada\\s+(\\d{1,2}|${PALABRA_NUM})\\s+del?\\s+mes\\b`)) ??
      f.toma(new RegExp(`\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2}|primero)\\s+de\\s+mes\\b`));
    if (mensualDia) {
      const n = num(mensualDia[1]);
      if (n === null || n < 1 || n > 31) return { ok: false, reason: "NO_SE" };
      freq = "MENSUAL";
      monthday = n;
    } else if (
      f.toma(
        /\b(?:el )?ultimo dia (?:de cada|del|de todos los) mes(?:es)?\b|\b(?:a|cada|al|todos los) (?:fin|final|finales) de mes(?:es)?\b|\bfin(?:al)? de cada mes\b|\bcada ultimo (?:dia )?(?:de|del) mes\b/,
      )
    ) {
      freq = "MENSUAL";
      monthday = -1;
      f.toma(/\b(?:todos los meses|cada mes)\b/);
    } else if (f.toma(/\b(?:cada|el) (?:primero|inicio|principio) de (?:cada )?mes\b|\ba principios? de (?:cada )?mes\b/)) {
      freq = "MENSUAL";
      monthday = 1;
      f.toma(/\b(?:todos los meses|cada mes)\b/);
    } else if (f.toma(/\b(?:cada mes|todos los meses|mensualmente|una vez al mes)\b/)) {
      freq = "MENSUAL";
      mensualSinDia = true;
    }
  }

  // «una vez el 15»: es lo que ya se entiende sin decirlo.
  if (!freq) f.toma(/\buna (?:sola )?vez\b/);

  // ------------------------------------------------------------------- fechas
  // «todos los días desde el lunes»: la fecha es desde cuándo. Sin «desde», una
  // fecha suelta junto a una regla que se repite no se lee.
  const desde = freq !== null && freq !== "UNA_VEZ" && f.toma(/\b(?:desde|a partir del?|empezando(?: el)?|comenzando(?: el)?)\b/) !== null;
  if (!onDate && (freq === null || desde)) {
    if (f.toma(/\bpasado manana\b/)) onDate = hoy.plus({ days: 2 });
    else {
      const manana = f.toma(/(?<!\b(?:la|las|esta|cada|una|de|por|en)\s+)\bmanana\b/);
      if (manana) onDate = hoy.plus({ days: 1 });
      else {
        const esta = f.toma(/\besta (manana|tarde|noche)\b/);
        if (esta) {
          onDate = hoy;
          periodo = periodoDe(esta[1]);
        } else if (f.toma(/\bhoy\b/)) {
          onDate = hoy;
        }
      }
    }
  }

  // Un día de la semana suelto: el próximo (nunca hoy). En «cada semana el
  // lunes» es el día de la regla.
  const diaSuelto = f.toma(
    new RegExp(
      `\\b(?:el\\s+|este\\s+|esta\\s+|el\\s+proximo\\s+|el\\s+siguiente\\s+|proximo\\s+|para el\\s+)?(${DIA_SINGULAR})(?:\\s+que\\s+viene|\\s+proximo|\\s+de la semana que viene)?\\b`,
    ),
  );
  if (diaSuelto) {
    const d = DIAS[diaSuelto[1]];
    let delta = (d - hoy.weekday + 7) % 7;
    if (delta === 0) delta = 7;
    if (freq === "SEMANAL" && semanalSinDia) {
      days = [d];
      semanalSinDia = false;
    } else if (!freq || freq === "UNA_VEZ" || desde) {
      if (onDate) return { ok: false, reason: "NO_SE" };
      onDate = hoy.plus({ days: delta });
    }
  }

  let diaDelMes: number | null = null;
  if (!onDate && (freq === null || freq === "UNA_VEZ" || desde)) {
    const conMes =
      f.toma(
        new RegExp(
          `\\b(?:(?:para )?el\\s+)?(?:dia\\s+)?(\\d{1,2}|${PALABRA_NUM})\\s+de\\s+(${MES})\\.?(?:\\s+(?:de|del)\\s+(\\d{4}))?\\b`,
        ),
      ) ?? null;
    const iso = conMes ? null : f.toma(/\b(?:(?:para )?el\s+)?(\d{4})-(\d{2})-(\d{2})\b/);
    const barra = conMes || iso ? null : f.toma(/\b(?:el\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (conMes) {
      onDate = fechaDeDiaYMes(num(conMes[1]), MESES[conMes[2]], conMes[3] ? Number(conMes[3]) : null, hoy);
      if (!onDate) return { ok: false, reason: "NO_SE" };
    } else if (iso) {
      const d = DateTime.fromObject({ year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }, { zone: ctx.tz });
      if (!d.isValid) return { ok: false, reason: "NO_SE" };
      onDate = d.startOf("day");
    } else if (barra) {
      const año = barra[3] ? (barra[3].length === 2 ? 2000 + Number(barra[3]) : Number(barra[3])) : null;
      onDate = fechaDeDiaYMes(Number(barra[1]), Number(barra[2]), año, hoy);
      if (!onDate) return { ok: false, reason: "NO_SE" };
    } else if (f.toma(/\b(?:la semana que viene|la proxima semana|la otra semana|la semana proxima)\b/)) {
      onDate = hoy.plus({ days: 8 - hoy.weekday });
    } else if (f.toma(/\b(?:el mes que viene|el proximo mes|el mes proximo)\b/)) {
      onDate = hoy.plus({ months: 1 }).startOf("month");
    } else {
      const soloDia = f.toma(
        new RegExp(
          `\\b(?:(?:para )?el\\s+)(?:dia\\s+)?(\\d{1,2}|primero|${PALABRA_NUM})\\b(?!\\s*(?::|h\\b|hrs?\\b|am\\b|pm\\b|de la|por la|minutos?|horas?|dias?|semanas?))`,
        ),
      );
      if (soloDia) {
        const n = num(soloDia[1]);
        if (n === null || n < 1 || n > 31) return { ok: false, reason: "NO_SE" };
        onDate = proximoDia(n, hoy);
        if (!onDate) return { ok: false, reason: "NO_SE" };
        diaDelMes = n;
      }
    }
  }

  // «cada mes el 15» cuando el 15 llegó suelto.
  if (freq === "MENSUAL" && mensualSinDia) {
    const elDia = f.toma(new RegExp(`\\b(?:el\\s+)?(?:dia\\s+)?(\\d{1,2}|primero)\\b(?!\\s*(?::|h\\b|am\\b|pm\\b|de la))`));
    const n = elDia ? num(elDia[1]) : hoy.day;
    if (n === null || n < 1 || n > 31) return { ok: false, reason: "NO_SE" };
    monthday = n;
  }

  // -------------------------------------------------------------------- hora
  if (!hora) {
    const HORA = `(\\d{1,2}|${PALABRA_NUM})`;
    const conLas = f.toma(
      new RegExp(
        `\\b(?:(?:a|sobre|hacia|como a|a eso de|para|desde)\\s+las?|tipo(?:\\s+las?)?)\\s+${HORA}(?:\\s*(?::|\\.|h)\\s*(\\d{2}))?(?:\\s*(?:hrs|hr|horas|h)\\b)?(?:\\s+y\\s+(media|cuarto|\\d{1,2}|${PALABRA_NUM})|\\s+menos\\s+(cuarto|\\d{1,2}|${PALABRA_NUM}))?(?:\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)|\\s+(?:de|por|en)\\s+la\\s+(manana|tarde|noche|madrugada)|\\s+del\\s+(mediodia))?`,
      ),
    );
    const suelta = conLas
      ? null
      : f.toma(
          /\b(\d{1,2})(?:\s*:\s*(\d{2}))?\s*(?:(a\.?\s?m\.?|p\.?\s?m\.?)|\s+(?:de|por|en)\s+la\s+(manana|tarde|noche|madrugada))/,
        ) ?? f.toma(/\b(\d{1,2})\s*:\s*(\d{2})\b/) ?? f.toma(/\b(\d{1,2})\s*(?:h|hrs)\b/);
    if (conLas) {
      const h = num(conLas[1]);
      let m = conLas[2] ? Number(conLas[2]) : 0;
      if (conLas[3]) m = conLas[3] === "media" ? 30 : conLas[3] === "cuarto" ? 15 : (num(conLas[3]) ?? -1);
      const p = periodoDe(conLas[5]) ?? periodoDe(conLas[6]) ?? periodoDe(conLas[7]) ?? periodo ?? periodoDeRegla;
      if (h === null || h > 23 || m < 0 || m > 59) return { ok: false, reason: "NO_SE" };
      // «a las 03:00», con el cero delante, es hora de reloj: las 3.
      let hh = h > 12 || /^0\d/.test(conLas[1]) ? h : ajustaHora(h, p);
      if (conLas[4]) {
        const menos = conLas[4] === "cuarto" ? 15 : (num(conLas[4]) ?? -1);
        if (menos < 1 || menos > 59) return { ok: false, reason: "NO_SE" };
        hh = (hh + 23) % 24;
        m = 60 - menos;
      }
      hora = { h: hh, m };
      timeSaid = true;
    } else if (suelta) {
      const h = Number(suelta[1]);
      const m = suelta[2] ? Number(suelta[2]) : 0;
      const p = periodoDe(suelta[3]) ?? periodoDe(suelta[4]) ?? periodo ?? periodoDeRegla;
      if (h > 23 || m > 59) return { ok: false, reason: "NO_SE" };
      hora = { h: h > 12 || /^0\d/.test(suelta[1]) ? h : ajustaHora(h, p), m };
      timeSaid = true;
    } else if (f.toma(/\b(?:al|a|en el|a el|para el)\s+medio\s?dia\b|\bmedio\s?dia\b/)) {
      horaFija = "12:00";
      timeSaid = true;
    } else if (f.toma(/\b(?:a la |a )?medianoche\b/)) {
      horaFija = "00:00";
      timeSaid = true;
    } else if (f.toma(/\ba primera hora\b|\btemprano\b|\bbien temprano\b/)) {
      horaFija = HORA_DE_PERIODO.temprano;
      timeSaid = true;
    }
  }

  // La parte del día sin hora («por la tarde»).
  if (!hora && !horaFija) {
    const parte = f.toma(/\b(?:por|en|de|a) la (manana|tarde|noche)\b|\bpor las (mananas|tardes|noches)\b/);
    const p = parte ? (parte[1] ?? parte[2]).replace(/s$/, "").replace("mananas", "manana") : null;
    const elegido = (p as "manana" | "tarde" | "noche" | null) ?? (periodo as "manana" | "tarde" | "noche" | null) ?? (periodoDeRegla as "manana" | "tarde" | "noche" | null);
    if (elegido && elegido in HORA_DE_PERIODO) {
      horaFija = HORA_DE_PERIODO[elegido];
      timeSaid = true;
    }
  }

  // --------------------------------------------------------------- qué es
  const resto = f.resto.replace(/\s+/g, " ").trim();
  let kind: ReminderKind = "TEXTO";
  let project: string | null = null;

  const queFalta = new RegExp(
    `^(?:(?:y |que )?(?:me )?(?:dime|decirme|di|mandame|muestrame|ensename|avisame|repasar|revisar|ver)\\s+)?(?:que|lo que|lo que me|que me|que cosas|que hay)?\\s*(?:me\\s+)?(?:falta|faltan|queda|quedan|hay pendiente|esta pendiente)(?:\\s+(?:por hacer|pendiente))?\\s+(?:en|de|para|del|con)\\s+(?:el proyecto (?:de |del )?|lo de |la |el )?(.+)$`,
  );
  const pendientes = /^(?:(?:dime|repasar|revisar|ver)\s+)?(?:los |mis )?pendientes (?:de|del|en) (?:el proyecto (?:de )?|lo de )?(.+)$/;
  const comoVa = /^(?:(?:dime|decirme|di)\s+)?como (?:va|van|vamos|anda|andan|esta|estan|sigue)\s+(?:el proyecto (?:de |del )?|lo de |las cosas (?:en|de|con) |la cosa (?:en|de|con) |el tema (?:de |del )?)?(.+)$/;
  const tuDia =
    /^(?:(?:dime|mandame|el|mi|tu)\s+)*(?:resumen (?:de|del) (?:mi |el )?dia|resumen de (?:la )?manana|resumen diario|mi dia|tu dia|como (?:viene|pinta|va) (?:mi|el) dia|lo de hoy|que tengo hoy|la agenda del dia)$/;

  const m1 = queFalta.exec(resto) ?? pendientes.exec(resto);
  const m2 = m1 ? null : comoVa.exec(resto);
  if (m1 || m2) {
    kind = m1 ? "QUE_FALTA" : "COMO_VA";
    const crudo = (m1 ?? m2)![1].trim();
    project = recortaOriginal(f.original, crudo);
  } else if (tuDia.test(resto)) {
    kind = "TU_DIA";
  }

  // -------------------------------------------------------- texto y validez
  const text = kind === "TEXTO" ? limpiaTexto(f.restoOriginal) : "";

  const hayCuando = freq !== null || onDate !== null || hora !== null || horaFija !== null;
  if (!hayCuando) {
    // «qué falta en X» sin cuándo no es un recordatorio: es una pregunta.
    return { ok: false, reason: trigger || kind !== "TEXTO" ? "SIN_CUANDO" : "NO_SE" };
  }
  if (kind === "TEXTO" && text === "") return { ok: false, reason: "SIN_QUE" };

  let atTime =
    hora !== null
      ? `${pad(hora.h)}:${pad(hora.m)}`
      : (horaFija ?? (kind === "TU_DIA" ? "07:30" : "09:00"));
  if (atTime === "24:00") atTime = "00:00";

  if (!freq) freq = "UNA_VEZ";
  if (freq === "SEMANAL" && days.length === 0) days = [hoy.weekday];

  // «el 7» dicho el día 7 con la hora ya pasada: el 7 del mes que viene.
  if (freq === "UNA_VEZ" && onDate && diaDelMes !== null && onDate.hasSame(hoy, "day")) {
    const [h, m] = atTime.split(":").map(Number);
    if (hoy.set({ hour: h, minute: m }) <= ahora) onDate = proximoDia(diaDelMes, hoy.plus({ days: 1 }));
    if (!onDate) return { ok: false, reason: "NO_SE" };
  }

  // Sólo hora (o parte del día): hoy si no ha pasado; si no, mañana.
  if (freq === "UNA_VEZ" && !onDate) {
    const [h, m] = atTime.split(":").map(Number);
    const hoyALaHora = hoy.set({ hour: h, minute: m });
    onDate = hoyALaHora > ahora ? hoy : hoy.plus({ days: 1 });
  }

  // Cada N días: desde hoy si la hora no ha pasado; si no, desde mañana.
  if (freq === "CADA_N_DIAS" && !onDate) {
    const [h, m] = atTime.split(":").map(Number);
    onDate = hoy.set({ hour: h, minute: m }) > ahora ? hoy : hoy.plus({ days: 1 });
  }

  const rule: ReminderRule = {
    freq,
    atTime,
    days: freq === "SEMANAL" ? days : [],
    monthday: freq === "MENSUAL" ? monthday : null,
    everyN: freq === "CADA_N_DIAS" ? everyN : null,
    // En las que se repiten, la fecha es «desde» (sólo si se dijo).
    onDate: onDate?.toISODate() ?? null,
    untilDate: freq === "UNA_VEZ" ? null : (untilDate?.toISODate() ?? null),
  };

  return {
    ok: true,
    value: {
      rule,
      timeSaid,
      kind,
      text,
      project,
      trigger,
    },
  };
}

// ---------------------------------------------------------------- auxiliares

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

/** El próximo día N (este mes si no ha pasado; si el mes no lo tiene, el siguiente que sí). */
function proximoDia(n: number, hoy: DateTime): DateTime | null {
  let mes = hoy.startOf("month");
  for (let i = 0; i < 13; i += 1) {
    if (n <= (mes.daysInMonth ?? 31)) {
      const d = mes.set({ day: n });
      if (d >= hoy) return d;
    }
    mes = mes.plus({ months: 1 });
  }
  return null;
}

/** «15 de octubre»: este año si no ha pasado; si no, el que viene. */
function fechaDeDiaYMes(dia: number | null, mes: number | undefined, año: number | null, hoy: DateTime): DateTime | null {
  if (dia === null || mes === undefined || dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const intento = (a: number) => {
    const d = DateTime.fromObject({ year: a, month: mes, day: dia }, { zone: hoy.zone });
    return d.isValid ? d.startOf("day") : null;
  };
  if (año !== null) return intento(año);
  const este = intento(hoy.year);
  if (este && este >= hoy) return este;
  return intento(hoy.year + 1);
}

/** El trozo de la frase original que corresponde a `crudo` (normalizado), con sus tildes. */
function recortaOriginal(original: string, crudo: string): string {
  const i = normaliza(original).lastIndexOf(crudo);
  const trozo = limpiaBordes(i < 0 ? crudo : original.slice(i, i + crudo.length));
  // «la casa» → «casa»: el proyecto se busca por su nombre, sin el artículo.
  return trozo.replace(/^(?:el|la|los|las|lo de)\s+/i, "");
}

function limpiaBordes(texto: string): string {
  return texto.replace(/^[\s,.;:¡!¿?\-–—«»"']+|[\s,.;:¡!¿?\-–—«»"']+$/g, "").replace(/\s+/g, " ");
}

const DELANTE = /^(?:que tengo que|tengo que|hay que|debo|de que|que|de|para|y|e)\s+/i;
const DETRAS = /\s+(?:y|de|que|para|a|en|por|e)$/i;

/** Lo que queda después de quitar el «cuándo»: el «qué», sin conectores sueltos. */
function limpiaTexto(texto: string): string {
  let t = limpiaBordes(texto);
  for (let i = 0; i < 4; i += 1) {
    const antes = t;
    t = limpiaBordes(t.replace(DELANTE, "").replace(DETRAS, ""));
    if (t === antes) break;
  }
  if (t === "") return "";
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 200);
}
