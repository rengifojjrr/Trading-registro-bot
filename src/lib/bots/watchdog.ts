import { WATCHDOG_MIN_EXPECTED, WATCHDOG_RATIO } from "./decisions";
import { ROLLING_WINDOW_DAYS, type BotPhase } from "./types";

/**
 * El watchdog: el pulsómetro del portfolio.
 *
 * No mide si un bot gana dinero -- de eso ya se encargan el semáforo y las
 * puertas -- sino si su corazón late al ritmo que prometió. Son dos preguntas
 * distintas y la segunda se contesta antes: un bot que debería hacer cincuenta
 * y ocho operaciones al mes y lleva cincuenta y nueve está vivo aunque vaya
 * perdiendo; uno que debería hacer siete y lleva cero está muerto aunque no
 * haya perdido un euro. Lo segundo casi nunca es el mercado: es el VPS
 * apagado, la API caducada, el símbolo renombrado o las operaciones sin
 * asignar. Y eso no lo detecta ninguna métrica de rentabilidad, porque un bot
 * apagado tiene un profit factor impecable.
 *
 * Lo esperado sale de `baseline.tradesPerMonth`; lo observado, de sus
 * operaciones de los últimos treinta días.
 *
 * Puro.
 */

/** El estado del pulso de un bot. */
export type EstadoDelPulso = "SANO" | "SILENCIOSO" | "HIPERACTIVO" | "SIN_RITMO";

export const PULSO_LABELS: Record<EstadoDelPulso, string> = {
  SANO: "Late a su ritmo",
  SILENCIOSO: "Silencioso",
  HIPERACTIVO: "Hiperactivo",
  SIN_RITMO: "Sin ritmo",
};

export const PULSO_INSTRUCCIONES: Record<EstadoDelPulso, string> = {
  SANO: "Opera lo que prometió. Nada que revisar aquí.",
  SILENCIOSO:
    "Antes de mirar el P&L, comprueba que el bot corre, que la conexión está viva y que sus operaciones están asignadas.",
  HIPERACTIVO:
    "Opera mucho más de lo que prometió: mira si le cambiaron los parámetros, si está duplicando órdenes o si el mercado cambió de régimen.",
  SIN_RITMO: "No prometió un ritmo, así que no hay nada contra lo que comparar.",
};

/**
 * Con menos operaciones esperadas al mes no hay pulso que tomar.
 *
 * Un bot que hace una operación al mes puede pasarse cinco semanas quieto sin
 * que pase nada raro: avisar de eso sería ruido, y el ruido acaba en que nadie
 * mira los avisos.
 *
 * Los dos umbrales se reexportan desde `decisions.ts` en vez de escribirse
 * otra vez. Allí ya vigilaba lo mismo la lista de decisiones pendientes, y dos
 * copias del mismo número acaban separándose: el día que alguien afine el
 * ratio, el aviso de la cabecera y esta pantalla dirían cosas distintas del
 * mismo bot, que es la forma más rápida de que se deje de creer a las dos.
 */
export const MINIMO_ESPERADAS_AL_MES = WATCHDOG_MIN_EXPECTED;

/** Por debajo de esta fracción de lo esperado, el bot no late. */
export const RATIO_SILENCIOSO = WATCHDOG_RATIO;

/** Y por encima de ésta late demasiado deprisa. */
export const RATIO_HIPERACTIVO = 2.5;

/**
 * Días de histórico por debajo de los cuales el ritmo propio no es un ritmo.
 *
 * Sin línea base declarada se puede usar el ritmo que el bot ha llevado hasta
 * ahora, pero sólo si lleva ya un par de meses: dos operaciones en su primer
 * día no son «sesenta al mes».
 */
export const MINIMO_DIAS_PARA_RITMO_PROPIO = 60;

/** Días naturales del mes medio. El mismo que usa `metrics.ts`. */
const DIAS_DEL_MES = 30.44;

/** Lo que el watchdog necesita saber de una operación: cuándo abrió y cuándo cerró. */
export interface OperacionDelPulso {
  openedAt: string;
  closedAt: string | null;
}

export interface BotParaWatchdog {
  id: string;
  nombre: string;
  fase: BotPhase;
  /** Operaciones al mes que promete su línea base. `null` si no prometió ninguna. */
  esperadasAlMes: number | null;
  operaciones: OperacionDelPulso[];
}

export interface LecturaDelPulso {
  botId: string;
  nombre: string;
  fase: BotPhase;
  estado: EstadoDelPulso;
  /** Días que abarca la ventana. */
  dias: number;
  /** Las que tocaban en esa ventana, prorrateadas desde el ritmo mensual. */
  esperadas: number | null;
  /** Las que de verdad hubo: abiertas o cerradas dentro de la ventana. */
  observadas: number;
  /** Observadas entre esperadas. 1 es exactamente su ritmo. */
  ratio: number | null;
  /** El desvío en porcentaje: +30 es un 30% por encima de lo prometido. */
  desvioPct: number | null;
  /** Días desde la última señal de vida. `null` si nunca ha operado. */
  diasSinOperar: number | null;
  /** Si ahora mismo tiene alguna posición abierta. */
  enMercado: boolean;
  motivo: string;
}

export interface ResumenDelWatchdog {
  dias: number;
  /** Todos los bots vivos, con los que hay que mirar primero delante. */
  lecturas: LecturaDelPulso[];
  sanos: number;
  silenciosos: number;
  hiperactivos: number;
  sinRitmo: number;
  /** Los que hay que mirar hoy, del más desviado al menos. */
  alertas: LecturaDelPulso[];
}

/**
 * El ritmo contra el que se compara: el prometido o, si no prometió, el suyo.
 *
 * La regla vive aquí y no en cada pantalla para que «cuántas operaciones
 * debería hacer este bot» tenga una sola respuesta en toda la aplicación.
 */
export function ritmoEsperado(
  declarado: number | null,
  propio: number | null,
  spanDays: number,
): number | null {
  if (declarado !== null) return declarado;
  return spanDays >= MINIMO_DIAS_PARA_RITMO_PROPIO ? propio : null;
}

/**
 * Operaciones con señal de vida dentro de la ventana.
 *
 * Cuentan las abiertas y las cerradas: un swing que entró hace tres semanas y
 * sigue dentro no ha cerrado nada, pero abrió, y abrir es latir.
 */
export function operacionesEnVentana(
  operaciones: OperacionDelPulso[],
  ahora: Date,
  dias: number,
): number {
  const desde = ahora.getTime() - dias * 86_400_000;
  return operaciones.filter(
    (op) =>
      Date.parse(op.openedAt) >= desde ||
      (op.closedAt !== null && Date.parse(op.closedAt) >= desde),
  ).length;
}

/**
 * Días naturales desde la última señal de vida.
 *
 * La última señal es la más reciente de las dos puntas: abrir y cerrar son las
 * dos cosas que hace un bot, y cualquiera de ellas demuestra que sigue ahí.
 */
export function diasSinOperar(operaciones: OperacionDelPulso[], ahora: Date): number | null {
  let ultima = Number.NEGATIVE_INFINITY;

  for (const op of operaciones) {
    const abre = Date.parse(op.openedAt);
    if (Number.isFinite(abre)) ultima = Math.max(ultima, abre);
    if (op.closedAt !== null) {
      const cierra = Date.parse(op.closedAt);
      if (Number.isFinite(cierra)) ultima = Math.max(ultima, cierra);
    }
  }

  if (!Number.isFinite(ultima)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - ultima) / 86_400_000));
}

export function medirPulso(
  bot: BotParaWatchdog,
  ahora: Date,
  dias: number = ROLLING_WINDOW_DAYS,
): LecturaDelPulso {
  const observadas = operacionesEnVentana(bot.operaciones, ahora, dias);
  const quieto = diasSinOperar(bot.operaciones, ahora);
  const enMercado = bot.operaciones.some((op) => op.closedAt === null);

  const comun = {
    botId: bot.id,
    nombre: bot.nombre,
    fase: bot.fase,
    dias,
    observadas,
    diasSinOperar: quieto,
    enMercado,
  };

  // Una línea base escrita a mano puede traer cualquier cosa, así que lo que
  // no sea un número de verdad se trata como lo que es: ningún ritmo.
  const declaradas =
    bot.esperadasAlMes !== null && Number.isFinite(bot.esperadasAlMes) ? bot.esperadasAlMes : null;

  if (declaradas === null || declaradas < MINIMO_ESPERADAS_AL_MES) {
    return {
      ...comun,
      estado: "SIN_RITMO",
      esperadas: null,
      ratio: null,
      desvioPct: null,
      motivo:
        declaradas === null
          ? "Sin ritmo declarado ni histórico suficiente para deducirlo."
          : `Espera menos de ${MINIMO_ESPERADAS_AL_MES} operaciones al mes: demasiado poco para tomarle el pulso.`,
    };
  }

  // Prorrateado a los días de la ventana: comparar treinta días contra un mes
  // entero le regalaría medio día de margen a todos los bots.
  const esperadas = declaradas * (dias / DIAS_DEL_MES);
  const ratio = observadas / esperadas;
  const desvioPct = (ratio - 1) * 100;

  const estado: EstadoDelPulso =
    ratio < RATIO_SILENCIOSO ? "SILENCIOSO" : ratio > RATIO_HIPERACTIVO ? "HIPERACTIVO" : "SANO";

  return { ...comun, estado, esperadas, ratio, desvioPct, motivo: motivoDe(estado, comun, esperadas) };
}

export function watchdog(
  bots: BotParaWatchdog[],
  ahora: Date,
  dias: number = ROLLING_WINDOW_DAYS,
): ResumenDelWatchdog {
  // Un bot retirado que no opera está haciendo exactamente lo que se espera de
  // él. Contarlo como silencioso llenaría el panel de muertos avisando de que
  // están muertos.
  const lecturas = bots
    .filter((b) => b.fase !== "RETIRADO")
    .map((b) => medirPulso(b, ahora, dias))
    // El orden lo decide aquí y no la pantalla: quien mira esto busca al que
    // no late, y buscarlo entre veinte filas sanas es lo mismo que no mirarlo.
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || desvio(b) - desvio(a));

  const cuenta = (estado: EstadoDelPulso) => lecturas.filter((l) => l.estado === estado).length;
  const alertas = lecturas.filter((l) => l.estado === "SILENCIOSO" || l.estado === "HIPERACTIVO");

  return {
    dias,
    lecturas,
    sanos: cuenta("SANO"),
    silenciosos: cuenta("SILENCIOSO"),
    hiperactivos: cuenta("HIPERACTIVO"),
    sinRitmo: cuenta("SIN_RITMO"),
    alertas,
  };
}

/** Primero los rotos, luego los sanos y al final los que no tienen ritmo. */
const ORDEN: Record<EstadoDelPulso, number> = {
  SILENCIOSO: 0,
  HIPERACTIVO: 0,
  SANO: 1,
  SIN_RITMO: 2,
};

const desvio = (l: LecturaDelPulso) => Math.abs(l.desvioPct ?? 0);

function motivoDe(
  estado: EstadoDelPulso,
  datos: { dias: number; observadas: number; diasSinOperar: number | null; enMercado: boolean },
  esperadas: number,
): string {
  const { dias, observadas, enMercado } = datos;
  const cuantas = `${observadas} operaci${observadas === 1 ? "ón" : "ones"}`;
  const tocaban = `las ${esperadas.toFixed(0)} que le tocaban`;

  if (estado === "SANO") {
    return `${cuantas} en ${dias} días contra ${tocaban}.`;
  }

  if (estado === "HIPERACTIVO") {
    return `${cuantas} en ${dias} días contra ${tocaban}: más del doble de su ritmo.`;
  }

  const silencio =
    datos.diasSinOperar === null
      ? "Nunca ha operado."
      : `${datos.diasSinOperar} día${datos.diasSinOperar === 1 ? "" : "s"} sin dar señales.`;
  const aguantando = enMercado ? " Tiene una posición abierta, así que al menos entró alguna vez." : "";

  return `${cuantas} en ${dias} días contra ${tocaban}. ${silencio}${aguantando}`;
}
