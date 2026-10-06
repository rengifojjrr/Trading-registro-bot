import { normalizeName } from "@/core/people";
import { PARSE_FAILURE_TEXT, parseReminder, type ParsedReminder } from "@/core/reminders/parse";
import { describeRule } from "@/core/reminders/rule";
import { DateTime } from "@/lib/fecha";
import type { LogKind, ProjectHealth, ProjectStatus } from "@/types/database";

import { HEALTH_LABELS, PROJECT_STATUS_LABELS, dayLabel, slugify } from "./projects";

/**
 * La orden rápida de la web, sin IA.
 *
 * El renglón de Hoy (y el de cada proyecto) entiende unas pocas formas fijas,
 * las mismas que el bot entenderá por WhatsApp:
 *
 * - «en petróleo agrega llamar al abogado el jueves» → tarea tuya;
 * - «en petróleo, Andrés tiene que mandar los análisis para el 15» → tarea de Andrés;
 * - «recuérdame cada día a las 8 revisar el precio» (o «en petróleo recuérdame…») → recordatorio;
 * - «nota en petróleo: el crudo es de 22 grados», «decisión en petróleo: …» → bitácora;
 * - «petróleo está atascado por el permiso», «petróleo va bien» → estado o semáforo;
 * - «hito de petróleo: visita al campo en noviembre» → hito.
 *
 * Siempre devuelve lo que entendió en palabras («Así lo entendí») y nada se
 * guarda sin que se toque «Guardar». Las fechas las lee el lector de
 * recordatorios (`core/reminders/parse.ts`), así una fecha se entiende igual
 * en una tarea que en un recordatorio. Lo que no encaja, lo dice: no adivina.
 */

export interface ProyectoParaOrden {
  id: string;
  name: string;
  slug: string | null;
  aliases: string[];
}

export interface PersonaParaOrden {
  id: string;
  name: string;
  aliases: string[];
  is_owner: boolean;
}

export interface ContextoOrden {
  now: Date;
  tz: string;
  projects: ProyectoParaOrden[];
  people: PersonaParaOrden[];
  /** Quién está en cada proyecto: para «Andrés», el de ese proyecto primero. */
  members: { projectId: string; personId: string }[];
  /** En la página de un proyecto, el proyecto se sobreentiende. */
  defaultProjectId?: string | null;
}

export type Orden =
  | {
      tipo: "TAREA";
      projectId: string;
      title: string;
      /** Null = tuya. */
      personId: string | null;
      due: string | null;
    }
  | { tipo: "NOTA"; projectId: string; logKind: Extract<LogKind, "NOTA" | "DECISION" | "AVANCE" | "BLOQUEO">; text: string }
  | { tipo: "ESTADO"; projectId: string; status: ProjectStatus | null; health: ProjectHealth | null; why: string | null }
  | { tipo: "HITO"; projectId: string; title: string; due: string | null; precision: "DIA" | "MES" }
  | { tipo: "RECORDATORIO"; projectId: string | null; reminder: ParsedReminder };

export type ResultadoOrden =
  | { ok: true; orden: Orden; entendido: string }
  | { ok: false; motivo: string; candidatos?: { id: string; name: string }[] };

// ------------------------------------------------------------------ proyectos

const ARTICULO = /^(?:el proyecto (?:de |del |de la |de los )?|lo de |el |la |los |las )/;

function sinArticulo(n: string): string {
  return n.replace(ARTICULO, "").trim();
}

/**
 * Distancia de edición con trasposición (para «petrolo» → «petróleo» y
 * «colombai» → «colombia»), con tope.
 */
function distancia(a: string, b: string, tope = 2): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + coste);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Palabras cortas no se corrigen: «canall» no es «canal», sería adivinar. */
const LARGO_PARA_CORREGIR = 6;

/**
 * Los proyectos que se llaman así: por nombre, slug u otros nombres, sin
 * tildes ni mayúsculas; si no, por una palabra entera del nombre; si no, con
 * un error de escritura. Con dos, quien llama pregunta «¿cuál?».
 */
export function findProjects(texto: string, projects: ProyectoParaOrden[]): ProyectoParaOrden[] {
  const n = sinArticulo(normalizeName(texto));
  if (n === "") return [];
  const nombres = (p: ProyectoParaOrden) => [p.name, ...(p.aliases ?? [])].map((x) => normalizeName(x));

  const exactos = projects.filter((p) => nombres(p).includes(n) || (p.slug !== null && p.slug === slugify(n)));
  if (exactos.length > 0) return exactos;

  const porPalabra = projects.filter((p) =>
    nombres(p).some((x) => ` ${x} `.includes(` ${n} `) || x.split(" ").some((w) => w === n)),
  );
  if (porPalabra.length > 0) return porPalabra;

  if (n.length < LARGO_PARA_CORREGIR) return [];
  return projects.filter((p) =>
    nombres(p).some(
      (x) =>
        (x.length >= LARGO_PARA_CORREGIR && distancia(x, n) <= 1) ||
        x.split(" ").some((w) => w.length >= LARGO_PARA_CORREGIR && distancia(w, n) <= 1),
    ),
  );
}

/** «Andrés»: por nombre, nombre de pila u otro nombre; los del proyecto primero. */
export function findPeople(texto: string, ctx: ContextoOrden, projectId: string | null): PersonaParaOrden[] {
  const conArticulo = normalizeName(texto).replace(/^(?:a |al )/, "");
  const n = conArticulo.replace(/^(?:el |la )/, "");
  if (n === "") return [];
  if (["mi", "yo", "mi mismo", "mi misma"].includes(n)) return ctx.people.filter((p) => p.is_owner);
  const otros = ctx.people.filter((p) => !p.is_owner);
  const exactos = otros.filter(
    (p) =>
      normalizeName(p.name) === n ||
      (p.aliases ?? []).some((a) => normalizeName(a) === n || normalizeName(a) === conArticulo),
  );
  const candidatos = exactos.length > 0 ? exactos : otros.filter((p) => normalizeName(p.name).split(" ")[0] === n);
  if (candidatos.length <= 1 || !projectId) return candidatos;
  const delProyecto = candidatos.filter((p) => ctx.members.some((m) => m.projectId === projectId && m.personId === p.id));
  return delProyecto.length > 0 ? delProyecto : candidatos;
}

// ------------------------------------------------------------------- el lector

const VERBO_TAREA = /^(?:agrega|agregar|agregame|anade|anadir|anademe|pon|ponme|apunta|apuntame|mete|crea|creame|nueva tarea|tarea)(?:\s+(?:una|la))?(?:\s+tarea)?\s*:?\s+/;
const TIPO_NOTA: Record<string, "NOTA" | "DECISION" | "AVANCE" | "BLOQUEO"> = {
  nota: "NOTA",
  anota: "NOTA",
  apunta: "NOTA",
  decision: "DECISION",
  avance: "AVANCE",
  bloqueo: "BLOQUEO",
};
const ESTADOS: [RegExp, ProjectStatus][] = [
  [/^(?:atascad[oa]|trabad[oa]|bloquead[oa]|frenad[oa])$/, "ATASCADO"],
  [/^(?:en pausa|parad[oa]|pausad[oa])$/, "EN_PAUSA"],
  [/^(?:terminad[oa]|list[oa]|cerrad[oa]|acabad[oa])$/, "TERMINADO"],
  [/^(?:en marcha|arrancad[oa]|activ[oa])$/, "EN_MARCHA"],
  [/^(?:esperando|en espera)$/, "ESPERANDO"],
  [/^(?:descartad[oa]|cancelad[oa])$/, "DESCARTADO"],
];
const SALUD: [RegExp, ProjectHealth][] = [
  [/^(?:bien|muy bien|genial)$/, "VERDE"],
  [/^(?:regular|mas o menos|lento|lenta)$/, "AMARILLO"],
  [/^(?:mal|muy mal|fatal)$/, "ROJO"],
];
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Normaliza para leer, conservando la longitud cuando hace falta recortar el original. */
function norma(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function capital(texto: string): string {
  const t = texto.trim().replace(/[.;]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Corta `n` palabras del principio del original y devuelve el resto, con sus tildes. */
function restoTrasPalabras(original: string, palabras: number): string {
  const partes = original.trim().split(/\s+/);
  return partes
    .slice(palabras)
    .join(" ")
    .replace(/^[,:;\s]+/, "")
    .trim();
}

export function parseOrder(texto: string, ctx: ContextoOrden): ResultadoOrden {
  const original = texto.replace(/\s+/g, " ").trim();
  if (original === "") return { ok: false, motivo: "Escribe qué hago. Por ejemplo «en petróleo agrega llamar al abogado el jueves»." };
  const t = norma(original);

  // ------------------------------------------------------ «en X …» (el proyecto delante)
  if (/^en\s/.test(t)) {
    const palabras = original.split(/\s+/);
    let elegido: { proyectos: ProyectoParaOrden[]; usadas: number } | null = null;
    for (let i = Math.min(6, palabras.length - 1); i >= 2; i -= 1) {
      const trozo = palabras.slice(1, i).join(" ").replace(/[,:;]+$/, "");
      const encontrados = findProjects(trozo, ctx.projects);
      if (encontrados.length > 0) {
        elegido = { proyectos: encontrados, usadas: i };
        break;
      }
    }
    if (!elegido) {
      const quizas = palabras[1]?.replace(/[,:;]+$/, "") ?? "";
      // «en 2 horas recuérdame…» no es un proyecto: que lo lea el de recordatorios.
      if (!esRecordatorio(t)) return { ok: false, motivo: `No tengo un proyecto «${quizas}».` };
    } else if (elegido.proyectos.length > 1) {
      return { ok: false, motivo: "¿Cuál?", candidatos: elegido.proyectos.map((p) => ({ id: p.id, name: p.name })) };
    } else {
      const proyecto = elegido.proyectos[0];
      const resto = restoTrasPalabras(original, elegido.usadas);
      return ordenEnProyecto(resto, proyecto, ctx);
    }
  }

  // ------------------------------------------------- «nota en X: …», «decisión en X: …»
  const nota = /^(nota|anota|apunta|decision|avance|bloqueo) (?:en|de|para) (.+?)\s*:\s*(.+)$/.exec(t);
  if (nota) {
    const proyecto = unico(nota[2], ctx);
    if ("motivo" in proyecto) return proyecto;
    const cuerpo = original.slice(original.indexOf(":") + 1).trim();
    return notaEn(proyecto, TIPO_NOTA[nota[1]], cuerpo);
  }

  // ------------------------------------------ «agrega en X: llamar al abogado»
  const tareaEn = /^(?:agrega|anade|pon|apunta|mete|crea)(?: una)?(?: tarea)? (?:en|a|para) (.+?)\s*:\s*(.+)$/.exec(t);
  if (tareaEn) {
    const proyecto = unico(tareaEn[1], ctx);
    if ("motivo" in proyecto) return proyecto;
    return tarea(original.slice(original.indexOf(":") + 1).trim(), proyecto, ctx);
  }

  // ----------------------------------------------------- «hito de X: …»
  const hito = /^hito (?:de|en|para) (.+?)\s*:\s*(.+)$/.exec(t);
  if (hito) {
    const proyecto = unico(hito[1], ctx);
    if ("motivo" in proyecto) return proyecto;
    return hitoEn(proyecto, original.slice(original.indexOf(":") + 1).trim(), ctx);
  }

  // -------------------------------------------------------- recordatorios
  // En la página de un proyecto, el recordatorio va atado a él.
  const porDefecto = ctx.defaultProjectId ? (ctx.projects.find((p) => p.id === ctx.defaultProjectId) ?? null) : null;
  if (esRecordatorio(t)) return recordatorio(original, porDefecto, ctx);

  // ------------------------------------- «X está atascado por…», «X va bien»
  const estado = /^(.+?) (?:esta|sigue|va|anda|quedo) (.+?)(?:\s+(?:por|porque|ya que)\s+(.+))?$/.exec(t);
  if (estado) {
    const encontrados = findProjects(estado[1], ctx.projects);
    if (encontrados.length === 1) {
      const r = estadoEn(encontrados[0], estado[2], estado[3] ? recorteDesde(original, estado[3]) : null);
      if (r) return r;
    } else if (encontrados.length > 1) {
      return { ok: false, motivo: "¿Cuál?", candidatos: encontrados.map((p) => ({ id: p.id, name: p.name })) };
    }
  }

  // ------------------------------------------- en la página de un proyecto
  if (ctx.defaultProjectId) {
    const proyecto = ctx.projects.find((p) => p.id === ctx.defaultProjectId);
    if (proyecto) {
      const r = ordenEnProyecto(original, proyecto, ctx, true);
      if (r.ok) return r;
    }
  }

  return {
    ok: false,
    motivo:
      "No lo entendí. Prueba «en petróleo agrega …», «recuérdame mañana a las 9 …», «nota en petróleo: …» o «petróleo está atascado».",
  };
}

function esRecordatorio(t: string): boolean {
  return (
    /\b(recuerdame|recordarme|recordame|recuerdamelo|acuerdame|avisame|recordatorio|que no se me olvide|no me dejes olvidar|recuerdale|recuerdales|recordarle|dile a)\b/.test(t) ||
    /\b(dime|mandame)\b.*\b(que (?:me )?falta|como va|resumen del dia|pendientes de)\b/.test(t)
  );
}

function unico(texto: string, ctx: ContextoOrden): ProyectoParaOrden | { ok: false; motivo: string; candidatos?: { id: string; name: string }[] } {
  const encontrados = findProjects(texto, ctx.projects);
  if (encontrados.length === 1) return encontrados[0];
  if (encontrados.length > 1) return { ok: false, motivo: "¿Cuál?", candidatos: encontrados.map((p) => ({ id: p.id, name: p.name })) };
  return { ok: false, motivo: `No tengo un proyecto «${texto.trim()}».` };
}

/** El trozo del original que corresponde a un trozo normalizado del final. */
function recorteDesde(original: string, normalizado: string): string {
  const palabras = normalizado.split(" ").length;
  const partes = original.split(/\s+/);
  return partes.slice(partes.length - palabras).join(" ");
}

/** Lo que va después de «en X»: una tarea, una nota, un hito, un recordatorio o un estado. */
function ordenEnProyecto(resto: string, proyecto: ProyectoParaOrden, ctx: ContextoOrden, implicito = false): ResultadoOrden {
  const r = norma(resto);

  if (esRecordatorio(r)) return recordatorio(resto, proyecto, ctx);

  const verbo = VERBO_TAREA.exec(r);
  if (verbo) return tarea(restoTrasPalabras(resto, verbo[0].trim().split(" ").length), proyecto, ctx);

  const tieneQue = /^(.+?) (?:tiene que|tienen que|debe|va a|queda en|se encarga de|le toca) (.+)$/.exec(r);
  if (tieneQue && tieneQue[1].split(" ").length <= 3) {
    const personas = findPeople(tieneQue[1], ctx, proyecto.id);
    if (personas.length === 1) {
      const cuerpo = recorteDesde(resto, tieneQue[2]);
      return tarea(cuerpo, proyecto, ctx, personas[0]);
    }
    if (personas.length > 1) {
      return { ok: false, motivo: `¿Cuál ${capital(tieneQue[1])}?`, candidatos: personas.map((p) => ({ id: p.id, name: p.name })) };
    }
    if (!implicito) return { ok: false, motivo: `No conozco a «${capital(tieneQue[1])}» en ${proyecto.name}. Ponlo en Personas.` };
  }

  const nota = /^(nota|anota|apunta|decision|avance|bloqueo)\s*:?\s+(.+)$/.exec(r);
  if (nota) return notaEn(proyecto, TIPO_NOTA[nota[1]], restoTrasPalabras(resto, 1).replace(/^:\s*/, ""));

  const hito = /^(?:hito|nuevo hito)\s*:?\s+(.+)$/.exec(r);
  if (hito) return hitoEn(proyecto, resto.replace(/^\S+(?:\s+hito)?\s*:?\s*/i, ""), ctx);

  const estado = /^(?:esta|sigue|va|anda) (.+?)(?:\s+(?:por|porque|ya que)\s+(.+))?$/.exec(r);
  if (estado) {
    const e = estadoEn(proyecto, estado[1], estado[2] ? recorteDesde(resto, estado[2]) : null);
    if (e) return e;
  }

  // En la página del proyecto, lo demás es una tarea tuya.
  if (implicito) return tarea(resto, proyecto, ctx);
  return { ok: false, motivo: `¿Qué hago en ${proyecto.name}? Por ejemplo «agrega llamar al abogado el jueves».` };
}

function tarea(cuerpo: string, proyecto: ProyectoParaOrden, ctx: ContextoOrden, persona?: PersonaParaOrden): ResultadoOrden {
  let texto = cuerpo.trim();
  let quien: PersonaParaOrden | null = persona ?? null;

  // «para Andrés» (sólo si es alguien que conozco; «para la reunión» se queda).
  if (!quien) {
    const para = /\bpara (?:mi|mí)\b|\bpara ([\p{L}]+(?: [\p{L}]+)?)/iu.exec(texto);
    if (para) {
      if (/^para m[ií]/i.test(para[0])) {
        texto = (texto.slice(0, para.index) + texto.slice(para.index + para[0].length)).trim();
      } else {
        for (const intento of [para[1], para[1].split(" ")[0]]) {
          const encontradas = findPeople(intento, ctx, proyecto.id);
          if (encontradas.length === 1) {
            quien = encontradas[0];
            const quitar = `para ${intento}`;
            const i = texto.toLowerCase().indexOf(quitar.toLowerCase());
            if (i >= 0) texto = (texto.slice(0, i) + texto.slice(i + quitar.length)).replace(/\s+/g, " ").trim();
            break;
          }
        }
      }
    }
  }
  if (quien?.is_owner) quien = null;

  // La fecha, con el lector de recordatorios (lo mismo se entiende igual).
  let due: string | null = null;
  const fecha = parseReminder(`recuérdame ${texto}`, { now: ctx.now, tz: ctx.tz });
  if (fecha.ok && fecha.value.rule.freq === "UNA_VEZ" && fecha.value.text !== "") {
    due = fecha.value.rule.onDate;
    texto = fecha.value.text;
  }
  const title = capital(texto.replace(/[,;:]+$/, ""));
  if (title === "") return { ok: false, motivo: "¿Qué tarea? Por ejemplo «agrega llamar al abogado»." };

  const today = DateTime.fromJSDate(ctx.now).setZone(ctx.tz).toISODate()!;
  const de = quien ? `Tarea de ${quien.name}` : "Tarea tuya";
  return {
    ok: true,
    orden: { tipo: "TAREA", projectId: proyecto.id, title: title.slice(0, 200), personId: quien?.id ?? null, due },
    entendido: [de, proyecto.name, due ? dayLabel(due, today) : null].filter(Boolean).join(" · ") + `: «${title}»`,
  };
}

function notaEn(
  proyecto: ProyectoParaOrden,
  logKind: "NOTA" | "DECISION" | "AVANCE" | "BLOQUEO",
  cuerpo: string,
): ResultadoOrden {
  const text = capital(cuerpo.replace(/^\s*:?\s*(?:que\s+)?/i, ""));
  if (text === "") return { ok: false, motivo: "¿Qué apunto?" };
  const etiqueta = { NOTA: "Nota", DECISION: "Decisión", AVANCE: "Avance", BLOQUEO: "Bloqueo" }[logKind];
  return {
    ok: true,
    orden: { tipo: "NOTA", projectId: proyecto.id, logKind, text: text.slice(0, 1500) },
    entendido: `${etiqueta} en ${proyecto.name}: «${text}»`,
  };
}

function hitoEn(proyecto: ProyectoParaOrden, cuerpo: string, ctx: ContextoOrden): ResultadoOrden {
  let texto = cuerpo.trim();
  let due: string | null = null;
  let precision: "DIA" | "MES" = "DIA";
  const hoy = DateTime.fromJSDate(ctx.now).setZone(ctx.tz);

  // «en noviembre», «para diciembre de 2027»: el mes entero (vence su último día).
  const mes = new RegExp(`\\b(?:en|para|a|de) (${MESES.join("|")})(?: (?:de |del )?(\\d{4}))?\\b`, "i").exec(norma(texto));
  // Primero un día concreto («el 15 de diciembre»); si no hay, el mes entero.
  const fechaDia = parseReminder(`recuérdame ${texto}`, { now: ctx.now, tz: ctx.tz });
  if (fechaDia.ok && fechaDia.value.rule.freq === "UNA_VEZ" && fechaDia.value.text !== "") {
    due = fechaDia.value.rule.onDate;
    texto = fechaDia.value.text;
  } else if (mes) {
    const m = MESES.indexOf(mes[1]) + 1;
    let año = mes[2] ? Number(mes[2]) : hoy.year;
    if (!mes[2] && m < hoy.month) año += 1;
    due = DateTime.fromObject({ year: año, month: m, day: 1 }, { zone: ctx.tz }).endOf("month").toISODate();
    precision = "MES";
    texto = recortaPalabras(texto, mes[0]);
  }
  const title = capital(texto);
  if (title === "") return { ok: false, motivo: "¿Qué hito?" };
  const today = hoy.toISODate()!;
  const cuando = due ? (precision === "MES" ? DateTime.fromISO(due).toFormat("LLL yyyy").replace(".", "") : dayLabel(due, today)) : null;
  return {
    ok: true,
    orden: { tipo: "HITO", projectId: proyecto.id, title: title.slice(0, 160), due, precision },
    entendido: [`Hito en ${proyecto.name}`, cuando].filter(Boolean).join(" · ") + `: «${title}»`,
  };
}

/** Quita del original las palabras que, normalizadas, son `trozo`. */
function recortaPalabras(original: string, trozo: string): string {
  const n = trozo.split(" ").length;
  const partes = original.split(/\s+/);
  for (let i = 0; i + n <= partes.length; i += 1) {
    if (norma(partes.slice(i, i + n).join(" ")) === trozo) {
      return [...partes.slice(0, i), ...partes.slice(i + n)].join(" ").trim();
    }
  }
  return original;
}

function estadoEn(proyecto: ProyectoParaOrden, que: string, why: string | null): ResultadoOrden | null {
  const q = que.trim();
  for (const [re, status] of ESTADOS) {
    if (re.test(q)) {
      return {
        ok: true,
        orden: { tipo: "ESTADO", projectId: proyecto.id, status, health: null, why: why ? capital(why) : null },
        entendido: `${proyecto.name} pasa a «${PROJECT_STATUS_LABELS[status]}»${why ? ` (por ${why})` : ""}`,
      };
    }
  }
  for (const [re, health] of SALUD) {
    if (re.test(q)) {
      return {
        ok: true,
        orden: { tipo: "ESTADO", projectId: proyecto.id, status: null, health, why: why ? capital(why) : null },
        entendido: `Semáforo de ${proyecto.name}: ${HEALTH_LABELS[health]} (14 días)${why ? `, por ${why}` : ""}`,
      };
    }
  }
  return null;
}

function recordatorio(texto: string, proyecto: ProyectoParaOrden | null, ctx: ContextoOrden): ResultadoOrden {
  const r = parseReminder(texto, { now: ctx.now, tz: ctx.tz });
  if (!r.ok) return { ok: false, motivo: PARSE_FAILURE_TEXT[r.reason] };
  const v = { ...r.value };
  let projectId = proyecto?.id ?? null;
  let nombre = proyecto?.name ?? null;

  // «en petróleo recuérdame cada lunes qué falta»: el proyecto ya se dijo delante.
  if (v.kind === "TEXTO" && proyecto) {
    const t = normalizeName(v.text);
    if (/^(?:que (?:me )?falta|lo que falta|que queda|los pendientes|pendientes)$/.test(t)) {
      v.kind = "QUE_FALTA";
      v.text = "";
    } else if (/^como (?:va|vamos|anda)$/.test(t)) {
      v.kind = "COMO_VA";
      v.text = "";
    }
  }

  if (v.kind === "QUE_FALTA" || v.kind === "COMO_VA") {
    const encontrados = v.project ? findProjects(v.project, ctx.projects) : proyecto ? [proyecto] : [];
    if (encontrados.length === 0) return { ok: false, motivo: `No tengo un proyecto «${v.project ?? ""}».` };
    if (encontrados.length > 1) return { ok: false, motivo: "¿Cuál?", candidatos: encontrados.map((p) => ({ id: p.id, name: p.name })) };
    projectId = encontrados[0].id;
    nombre = encontrados[0].name;
  } else if (!projectId) {
    // Atado al proyecto si el texto lo nombra («revisar el precio del crudo»
    // con un proyecto que se llama «crudo»), y se dice.
    const palabras = normalizeName(v.text).split(" ");
    for (const p of ctx.projects) {
      const nombres = [p.name, ...(p.aliases ?? [])].map((x) => normalizeName(x)).filter((x) => x.length >= 4);
      if (nombres.some((x) => ` ${palabras.join(" ")} `.includes(` ${x} `))) {
        projectId = p.id;
        nombre = p.name;
        break;
      }
    }
  }

  const today = DateTime.fromJSDate(ctx.now).setZone(ctx.tz).toISODate()!;
  const que =
    v.kind === "QUE_FALTA"
      ? `qué falta en ${nombre}`
      : v.kind === "COMO_VA"
        ? `cómo va ${nombre}`
        : v.kind === "TU_DIA"
          ? "tu día"
          : `«${v.text}»`;
  return {
    ok: true,
    orden: { tipo: "RECORDATORIO", projectId, reminder: { ...v, project: nombre } },
    entendido: [`Recordatorio · ${describeRule(v.rule, today)}`, que, v.kind === "TEXTO" && nombre ? nombre : null]
      .filter(Boolean)
      .join(" · "),
  };
}
