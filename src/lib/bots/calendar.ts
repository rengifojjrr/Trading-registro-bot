import { DateTime } from "luxon";

/**
 * El calendario de decisiones.
 *
 * Los cambios de portfolio tienen su día, y fuera de ese día no se hacen. Es
 * la regla que separa gestionar de toquetear: el domingo se revisa, y el
 * martes por la tarde, por mucho que pique, no. Cada cadencia tiene su lista
 * y su duración para que no se alargue.
 *
 *   * Cada domingo, veinte minutos técnicos.
 *   * Cada dos domingos, los semáforos.
 *   * El primer domingo de mes, backtest contra real, bloques,
 *     correlaciones y retirada.
 *   * El primer domingo de trimestre, robustez, alpha decay y el informe de
 *     impulsos.
 *   * El primer domingo de enero, la reestructuración.
 *
 * Puro: sin `Date.now()`, para poder probarlo.
 */

export type ReviewCadence = "SEMANAL" | "QUINCENAL" | "MENSUAL" | "TRIMESTRAL" | "ANUAL";

export const CADENCE_LABELS: Record<ReviewCadence, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
  TRIMESTRAL: "Trimestral",
  ANUAL: "Anual",
};

export interface ReviewTemplate {
  title: string;
  minutes: number;
  checklist: string[];
}

export const REVIEW_TEMPLATES: Record<ReviewCadence, ReviewTemplate> = {
  SEMANAL: {
    title: "Revisión técnica",
    minutes: 20,
    checklist: [
      "Todos los bots corren y están conectados.",
      "Los logs no tienen errores ni reconexiones raras.",
      "Las operaciones de la semana están asignadas a su bot.",
      "Nada más. No se toca ningún parámetro.",
    ],
  },
  QUINCENAL: {
    title: "Semáforos",
    minutes: 30,
    checklist: [
      "Mirar el semáforo de cada bot en producción.",
      "Los amarillos, confirmar que están al 50% del tamaño.",
      "Los naranjas, confirmar que están en papel.",
      "Los verdes, no tocar. Ni para bien ni para mal.",
    ],
  },
  MENSUAL: {
    title: "Revisión de portfolio",
    minutes: 60,
    checklist: [
      "Comparar cada bot con su línea base: lo que prometió contra lo que hizo.",
      "Mirar los bloques: si alguno se desvía más de diez puntos del 40/40/20, rebalancear hoy.",
      "Mirar las correlaciones: dos bots por encima de 0,5 son uno.",
      "Decidir la retirada de beneficios del mes.",
      "Revisar la cantera: qué puertas se abrieron y qué bots ascienden.",
    ],
  },
  TRIMESTRAL: {
    title: "Revisión de robustez",
    minutes: 120,
    checklist: [
      "Repetir el test de robustez de cada bot en producción con los datos nuevos.",
      "Buscar alpha decay: bots cuya ventaja se va apagando poco a poco.",
      "Leer el informe de impulsos: cuánto habría costado hacerse caso.",
      "Revisar el cementerio: qué lección de cada lápida sigue vigente.",
    ],
  },
  ANUAL: {
    title: "Reestructuración",
    minutes: 240,
    checklist: [
      "Cuestionar los objetivos 40/40/20 y la escalera de emergencia.",
      "Decidir qué familias de estrategia entran y cuáles salen.",
      "Revisar el tamaño de la cuenta y el riesgo por operación.",
      "Es el único día del año en que se cambian los umbrales.",
    ],
  },
};

export interface ReviewSession {
  cadence: ReviewCadence;
  title: string;
  minutes: number;
  checklist: string[];
  /** YYYY-MM-DD en la zona del usuario. */
  date: string;
  daysUntil: number;
  isToday: boolean;
}

/** Qué revisiones tocan un día dado. Sólo los domingos tienen alguna. */
export function reviewsOn(day: DateTime): ReviewCadence[] {
  if (day.weekday !== 7) return [];

  const cadences: ReviewCadence[] = ["SEMANAL"];
  if (day.weekNumber % 2 === 0) cadences.push("QUINCENAL");

  const primerDomingo = day.day <= 7;
  if (primerDomingo) {
    cadences.push("MENSUAL");
    if ([1, 4, 7, 10].includes(day.month)) cadences.push("TRIMESTRAL");
    if (day.month === 1) cadences.push("ANUAL");
  }

  return cadences;
}

/**
 * Las revisiones de los próximos días, de hoy en adelante.
 *
 * Hoy cuenta: si es domingo, la revisión de hoy es la primera de la lista y
 * no la que se perdió.
 */
export function reviewCalendar(now: Date, timezone: string, horizonDays = 90): ReviewSession[] {
  const zoned = DateTime.fromJSDate(now, { zone: timezone });
  const hoy = (zoned.isValid ? zoned : DateTime.fromJSDate(now, { zone: "UTC" })).startOf("day");

  const sessions: ReviewSession[] = [];
  for (let i = 0; i <= horizonDays; i += 1) {
    const day = hoy.plus({ days: i });
    for (const cadence of reviewsOn(day)) {
      const plantilla = REVIEW_TEMPLATES[cadence];
      sessions.push({
        cadence,
        title: plantilla.title,
        minutes: plantilla.minutes,
        checklist: plantilla.checklist,
        date: day.toISODate()!,
        daysUntil: i,
        isToday: i === 0,
      });
    }
  }

  return sessions;
}

/** La próxima revisión, la más amplia si hay varias el mismo día. */
export function nextReview(now: Date, timezone: string): ReviewSession | null {
  const proximas = reviewCalendar(now, timezone, 14);
  if (proximas.length === 0) return null;
  const primerDia = proximas[0].date;
  const delDia = proximas.filter((s) => s.date === primerDia);
  return delDia[delDia.length - 1];
}
