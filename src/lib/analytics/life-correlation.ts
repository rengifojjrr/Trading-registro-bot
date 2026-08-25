import { Decimal } from "decimal.js";

/**
 * Cómo operas según cómo dormiste y qué hiciste ese día.
 *
 * Es lo único que esta aplicación puede contarte y una plataforma de trading
 * no: los siete módulos llevan meses guardando cuánto duermes, qué hábitos
 * cumples y qué lees, y ninguno hablaba con el de trading. Cada uno enseñaba
 * su propia gráfica y la pregunta que los une -- «¿opero peor cuando duermo
 * mal?» -- no la contestaba nadie.
 *
 * Tres decisiones que evitan que esto sea numerología:
 *
 * 1. **Se comparan medianas, no medias.** Una sola operación de mil dólares
 *    mueve la media de un grupo de cinco días y hace parecer que dormir seis
 *    horas es rentable. La mediana aguanta eso.
 * 2. **Por debajo de un mínimo de días no se dice nada.** Con tres días a cada
 *    lado siempre sale una diferencia, y no significa nada. Antes de tener
 *    muestra, la respuesta honesta es «todavía no se sabe».
 * 3. **Se habla de coincidencia, nunca de causa.** Que ganes menos los días
 *    que duermes poco no demuestra que sea por dormir poco -- puede que las
 *    dos cosas pasen los días que hay noticias. El texto lo dice.
 *
 * Puro: recibe los días ya cruzados y no sabe de base de datos.
 */

/** Un día con lo que pasó en la vida y lo que pasó en la cuenta. */
export interface DayRow {
  date: string;
  /** Minutos dormidos la noche anterior a operar. Null si no se apuntó. */
  sleepMinutes: number | null;
  /** La nota que te pusiste al despertar, si la hay. */
  sleepScore: number | null;
  /** Cuántos hábitos marcaste ese día. */
  habitsDone: number;
  habitsTracked: number;
  /** Tareas que cerraste ese día. Cero es un dato, no un hueco. */
  tasksDone: number;
  /** Si leíste ese día. */
  didRead: boolean;
  /** Resultado neto del día, sumando lo cerrado. */
  netPnl: string;
  tradeCount: number;
}

export interface Split {
  label: string;
  days: number;
  medianPnl: string;
  winningDays: number;
}

export interface Comparison {
  question: string;
  /** Null cuando no hay muestra suficiente para decir nada. */
  worse: Split | null;
  better: Split | null;
  /** Diferencia de medianas, better menos worse. */
  difference: string | null;
  verdict: string;
}

/** Menos de esto a cada lado y cualquier diferencia es ruido. */
export const MIN_DAYS_PER_SIDE = 8;

export function compareBySleep(days: DayRow[], thresholdMinutes = 420): Comparison {
  const conDatos = days.filter((d) => d.sleepMinutes !== null && d.tradeCount > 0);
  const poco = conDatos.filter((d) => (d.sleepMinutes ?? 0) < thresholdMinutes);
  const bastante = conDatos.filter((d) => (d.sleepMinutes ?? 0) >= thresholdMinutes);

  const horas = Math.round((thresholdMinutes / 60) * 10) / 10;

  return build({
    question: `¿Operas distinto cuando duermes menos de ${String(horas).replace(".", ",")} horas?`,
    worse: split(`Menos de ${String(horas).replace(".", ",")} h`, poco),
    better: split(`${String(horas).replace(".", ",")} h o más`, bastante),
  });
}

export function compareByHabits(days: DayRow[]): Comparison {
  const conDatos = days.filter((d) => d.habitsTracked > 0 && d.tradeCount > 0);
  const flojos = conDatos.filter((d) => d.habitsDone / d.habitsTracked < 0.5);
  const buenos = conDatos.filter((d) => d.habitsDone / d.habitsTracked >= 0.5);

  return build({
    question: "¿Operas distinto los días que cumples tus hábitos?",
    worse: split("Menos de la mitad", flojos),
    better: split("La mitad o más", buenos),
  });
}

/**
 * ¿Operas distinto los días que sacas cosas adelante?
 *
 * Las tareas cerradas son el indicador más directo de haber tenido un día con
 * el que se puede, y era el módulo con más datos que no cruzaba con nada. El
 * corte es «alguna» y no una cifra alta a propósito: lo que se compara es
 * haber estado operativo o no, no haber sido productivo.
 */
export function compareByTasks(days: DayRow[]): Comparison {
  const conDatos = days.filter((d) => d.tradeCount > 0);
  const ninguna = conDatos.filter((d) => d.tasksDone === 0);
  const algunas = conDatos.filter((d) => d.tasksDone > 0);

  return build({
    question: "¿Operas distinto los días que sacas tareas adelante?",
    worse: split("Sin cerrar ninguna", ninguna),
    better: split("Con alguna cerrada", algunas),
  });
}

/**
 * ¿Y los días que lees?
 *
 * Es el cruce más flojo de los cuatro y se enseña igual: si no sale nada, esa
 * también es la respuesta, y saberlo evita seguir buscándole sentido.
 */
export function compareByReading(days: DayRow[]): Comparison {
  const conDatos = days.filter((d) => d.tradeCount > 0);

  return build({
    question: "¿Operas distinto los días que lees?",
    worse: split("Sin leer", conDatos.filter((d) => !d.didRead)),
    better: split("Leyendo", conDatos.filter((d) => d.didRead)),
  });
}

function split(label: string, days: DayRow[]): Split | null {
  if (days.length < MIN_DAYS_PER_SIDE) return null;

  return {
    label,
    days: days.length,
    medianPnl: median(days.map((d) => new Decimal(d.netPnl))).toFixed(2),
    winningDays: days.filter((d) => new Decimal(d.netPnl).greaterThan(0)).length,
  };
}

function build(params: { question: string; worse: Split | null; better: Split | null }): Comparison {
  const { question, worse, better } = params;

  if (!worse || !better) {
    return {
      question,
      worse,
      better,
      difference: null,
      verdict: `Todavía no hay días suficientes para decir nada. Hacen falta al menos ${MIN_DAYS_PER_SIDE} días operados a cada lado, y con menos cualquier diferencia sería ruido.`,
    };
  }

  const diff = new Decimal(better.medianPnl).minus(worse.medianPnl);

  return {
    question,
    worse,
    better,
    difference: diff.toFixed(2),
    // «Coincide», nunca «por eso». Que ganes menos los días que duermes poco
    // no demuestra que sea por dormir poco: puede que las dos cosas pasen los
    // días que hay noticias.
    verdict: diff.isZero()
      ? "No se ve diferencia entre los dos grupos."
      : `Los días de «${(diff.isPositive() ? better : worse).label}» coinciden con un día mediano ${diff.abs().toFixed(2)} mejor. Es una coincidencia observada, no una causa demostrada.`,
  };
}

/**
 * La mediana, con el promedio de las dos centrales cuando el número es par.
 *
 * No se usa la media a propósito: una operación de mil dólares en un grupo de
 * diez días la mueve cien dólares y hace parecer que dormir seis horas es
 * rentable.
 */
function median(values: Decimal[]): Decimal {
  if (values.length === 0) return new Decimal(0);
  const ordenados = [...values].sort((a, b) => a.comparedTo(b));
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? ordenados[medio - 1].plus(ordenados[medio]).dividedBy(2)
    : ordenados[medio];
}
