/**
 * The closed vocabulary of trading mistakes.
 *
 * Free text is where this kind of self-review goes to die: "entré tarde",
 * "entrada tardía" and "me apuré" are one thing to a person and three to a
 * database, so nothing can ever be counted. A fixed list is less expressive
 * and far more useful -- it can answer "which mistake costs me the most
 * money", which is the only question that changes behaviour.
 *
 * Kept free of server-only imports: both the tagging UI and the analytics
 * read from here.
 */

export const MISTAKE_CODES = [
  "LATE_ENTRY",
  "EARLY_ENTRY",
  "NO_SETUP",
  "MOVED_STOP",
  "NO_STOP",
  "OVERSIZED",
  "EARLY_EXIT",
  "LATE_EXIT",
  "REVENGE_TRADE",
  "OVERTRADING",
  "AGAINST_PLAN",
  "FOMO",
] as const;

export type MistakeCode = (typeof MISTAKE_CODES)[number];

export interface MistakeMeta {
  label: string;
  /** What counts as this mistake, so the same trade gets the same tag next month. */
  description: string;
  group: "ENTRADA" | "GESTIÓN" | "SALIDA" | "DISCIPLINA";
}

export const MISTAKE_META: Record<MistakeCode, MistakeMeta> = {
  LATE_ENTRY: {
    label: "Entrada tardía",
    description: "El setup era válido pero entraste después del punto que tu plan define.",
    group: "ENTRADA",
  },
  EARLY_ENTRY: {
    label: "Entrada prematura",
    description: "Entraste antes de que se confirmara la señal que esperabas.",
    group: "ENTRADA",
  },
  NO_SETUP: {
    label: "Sin setup",
    description: "No había ninguna condición de tu plan; fue una operación discrecional.",
    group: "ENTRADA",
  },
  FOMO: {
    label: "Miedo a quedarme fuera",
    description: "Entraste porque el precio ya se estaba moviendo, no porque tu señal apareciera.",
    group: "ENTRADA",
  },
  MOVED_STOP: {
    label: "Moví el stop",
    description: "Alejaste el stop para no asumir la pérdida planeada.",
    group: "GESTIÓN",
  },
  NO_STOP: {
    label: "Sin stop",
    description: "Entraste sin un nivel de invalidación definido.",
    group: "GESTIÓN",
  },
  OVERSIZED: {
    label: "Tamaño excesivo",
    description: "El tamaño superaba el riesgo por operación que te habías fijado.",
    group: "GESTIÓN",
  },
  EARLY_EXIT: {
    label: "Salida prematura",
    description: "Cerraste antes de tu objetivo sin que se invalidara la idea.",
    group: "SALIDA",
  },
  LATE_EXIT: {
    label: "Salida tardía",
    description: "Aguantaste más allá de tu objetivo o de tu invalidación.",
    group: "SALIDA",
  },
  REVENGE_TRADE: {
    label: "Operación de venganza",
    description: "Entraste inmediatamente después de una pérdida para recuperarla.",
    group: "DISCIPLINA",
  },
  OVERTRADING: {
    label: "Sobreoperar",
    description: "Superaste el número de operaciones que te habías propuesto para el día.",
    group: "DISCIPLINA",
  },
  AGAINST_PLAN: {
    label: "Contra el plan",
    description: "Hiciste algo que tu propio plan prohíbe explícitamente.",
    group: "DISCIPLINA",
  },
};

export function isMistakeCode(value: string): value is MistakeCode {
  return (MISTAKE_CODES as readonly string[]).includes(value);
}
