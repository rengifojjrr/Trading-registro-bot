import type { MistakeCode } from "./mistakes";
import type { SetupGrade } from "./setup-grade";

/**
 * «Sin definir» se guarda como `NONE` y no como null, que es como lo dejó la
 * ficha de la operación. Aquí sólo se ofrecen las dos direcciones: elegir
 * «sin definir» para doce operaciones a la vez sería borrar, y este cuadro no
 * borra nada.
 */
export type PlannedDirection = "LONG" | "SHORT" | "NONE";

/**
 * Apuntar varias operaciones de una vez.
 *
 * Doce entradas en veinte minutos no son doce decisiones: son una, tomada mal
 * y repetida. Apuntarlas obliga a escribir «FOMO» doce veces, y nadie lo hace,
 * así que el episodio que más caro sale es justo el que se queda sin apuntar.
 *
 * Dos reglas que hacen que esto no sea una forma rápida de perder el diario:
 *
 * 1. **Solo se toca lo que se marca.** Aplicar «errores» no borra las notas.
 *    Un campo que no se marca no se escribe, ni siquiera a null.
 * 2. **Se avisa antes de pisar algo escrito.** Se cuenta cuántas de las
 *    seleccionadas ya tienen valor en cada campo y se dice antes de hacerlo,
 *    con la opción de rellenar solo lo vacío. Una operación bien apuntada
 *    hace un mes no debería perderse por aplicar una etiqueta hoy.
 *
 * Puro: recibe el estado actual ya leído y dice qué pasaría. No escribe nada.
 */

/**
 * Lo que tiene sentido aplicar en bloque.
 *
 * Deliberadamente **no** están el riesgo, el stop, el objetivo ni el resultado
 * en R: son números de cada operación concreta, y ponerle el mismo stop a doce
 * entradas distintas no es cómodo, es falso. Lo que se comparte en un episodio
 * es el criterio y el estado de ánimo, no los precios.
 *
 * Sí están, en cambio, el resto de las preguntas del diario -- la nota del
 * setup, el sesgo de temporalidad alta, dónde estaba el precio y qué dirección
 * llevabas pensada. Son la lectura del mercado de ese rato, no una cifra de una
 * operación: doce entradas seguidas se tomaron con el mismo sesgo, y tener que
 * apuntarlo doce veces es exactamente por lo que no se apunta.
 */
export type BulkField =
  | "strategy_id"
  | "setup_grade"
  | "planned_direction"
  | "emotional_state"
  | "mistake_tag"
  | "mistakes"
  | "lesson_learned"
  | "notes"
  | "plan_adherence"
  | "entry_quality"
  | "htf_bias"
  | "sr_proximity";

export const BULK_FIELD_LABELS: Record<BulkField, string> = {
  strategy_id: "Estrategia",
  setup_grade: "Setup",
  planned_direction: "Dirección planeada",
  emotional_state: "Emociones",
  mistake_tag: "Errores (texto libre)",
  mistakes: "Errores",
  lesson_learned: "Lección aprendida",
  notes: "Notas",
  plan_adherence: "Adherencia al plan",
  entry_quality: "Calidad de entrada",
  htf_bias: "Sesgo de temporalidad alta",
  sr_proximity: "Proximidad a soporte/resistencia",
};

/** Qué se quiere poner. Un campo ausente es un campo que no se toca. */
export interface BulkValues {
  strategy_id?: string | null;
  setup_grade?: SetupGrade;
  planned_direction?: PlannedDirection;
  emotional_state?: string[];
  mistake_tag?: string[];
  mistakes?: MistakeCode[];
  lesson_learned?: string;
  notes?: string;
  plan_adherence?: number;
  entry_quality?: number;
  htf_bias?: string;
  sr_proximity?: string;
}

/** Lo que ya hay apuntado en una operación, para saber qué se pisaría. */
export interface ExistingJournal {
  tradeId: string;
  strategy_id: string | null;
  /** Vive como etiqueta («Setup: A+») y no como columna; ver setup-tags.ts. */
  setup_grade: SetupGrade | null;
  planned_direction: PlannedDirection | null;
  emotional_state: string | null;
  mistake_tag: string | null;
  lesson_learned: string | null;
  notes: string | null;
  plan_adherence: number | null;
  entry_quality: number | null;
  htf_bias: string | null;
  sr_proximity: string | null;
  mistakes: MistakeCode[];
}

export type BulkMode = "FILL_EMPTY" | "OVERWRITE";

export interface FieldPlan {
  field: BulkField;
  label: string;
  /** Operaciones que se van a escribir. */
  willWrite: number;
  /** De esas, cuántas ya tenían algo distinto escrito. */
  willOverwrite: number;
  /** Las que se saltan por tener ya valor, en modo «rellenar lo vacío». */
  skipped: number;
}

export interface BulkPlan {
  trades: number;
  fields: FieldPlan[];
  totalWrites: number;
  totalOverwrites: number;
  warning: string | null;
  summary: string;
}

/**
 * Qué pasaría si se aplicara, sin aplicarlo.
 *
 * Es lo que se enseña antes de confirmar. «Se van a pisar 3 notas» es una
 * frase que cambia la decisión; «¿seguro?» no.
 */
export function planBulkApply(params: {
  existing: ExistingJournal[];
  values: BulkValues;
  mode: BulkMode;
}): BulkPlan {
  const { existing, values, mode } = params;
  const fields: FieldPlan[] = [];

  for (const field of Object.keys(values) as BulkField[]) {
    if (!isChosen(values, field)) continue;

    let willWrite = 0;
    let willOverwrite = 0;
    let skipped = 0;

    for (const row of existing) {
      const tenia = hasValue(row, field);
      const cambia = wouldChange(row, field, values);

      if (tenia && mode === "FILL_EMPTY") {
        skipped += 1;
        continue;
      }
      if (!cambia) continue;

      willWrite += 1;
      if (tenia) willOverwrite += 1;
    }

    fields.push({ field, label: BULK_FIELD_LABELS[field], willWrite, willOverwrite, skipped });
  }

  const totalWrites = fields.reduce((sum, f) => sum + f.willWrite, 0);
  const totalOverwrites = fields.reduce((sum, f) => sum + f.willOverwrite, 0);

  return {
    trades: existing.length,
    fields,
    totalWrites,
    totalOverwrites,
    warning:
      totalOverwrites > 0
        ? `Se va a reemplazar lo que ya había escrito en ${totalOverwrites} caso${totalOverwrites === 1 ? "" : "s"}. Con «rellenar solo lo vacío» se respeta lo anterior.`
        : null,
    summary: describe(fields, existing.length, totalWrites),
  };
}

function describe(fields: FieldPlan[], trades: number, totalWrites: number): string {
  if (fields.length === 0) return "No has marcado ningún campo, así que no se cambiaría nada.";
  if (totalWrites === 0) {
    return `Las ${trades} operaciones ya tienen exactamente eso apuntado: no cambiaría nada.`;
  }

  const nombres = fields.filter((f) => f.willWrite > 0).map((f) => f.label.toLowerCase());
  const lista =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

  return `Se apuntará ${lista} en ${trades} operaci${trades === 1 ? "ón" : "ones"}.`;
}

/** Un campo marcado es uno presente y con contenido. Marcar y dejar vacío no borra. */
function isChosen(values: BulkValues, field: BulkField): boolean {
  const value = values[field];
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return value !== null;
}

function hasValue(row: ExistingJournal, field: BulkField): boolean {
  if (field === "mistakes") return row.mistakes.length > 0;

  // `NONE` es «sin definir», no una dirección elegida: la ficha de la
  // operación lo guarda así en vez de null. Contarlo como valor haría que
  // «rellenar solo lo vacío» se saltara justo las que están sin definir, que
  // son las únicas que había que rellenar.
  if (field === "planned_direction") {
    return row.planned_direction !== null && row.planned_direction !== "NONE";
  }

  const actual = row[field as Exclude<BulkField, "mistakes">];
  if (actual === null) return false;
  if (typeof actual === "string") return actual.trim() !== "";
  return true;
}

/** Escribir lo mismo que ya hay no cuenta como cambio, y no se cuenta como pisada. */
function wouldChange(row: ExistingJournal, field: BulkField, values: BulkValues): boolean {
  if (field === "mistakes") {
    return !sameSet(row.mistakes, values.mistakes ?? []);
  }
  if (field === "emotional_state" || field === "mistake_tag") {
    return !sameSet(splitList(row[field]), values[field] ?? []);
  }

  const nuevo = values[field as Exclude<BulkField, "mistakes" | "emotional_state" | "mistake_tag">];
  const actual = row[field as Exclude<BulkField, "mistakes">];

  if (typeof nuevo === "string" && typeof actual === "string") {
    return nuevo.trim() !== actual.trim();
  }
  return nuevo !== actual;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const conjunto = new Set(a);
  return b.every((x) => conjunto.has(x));
}

/**
 * `emotional_state` y `mistake_tag` se guardan como texto separado por comas,
 * que es como los dejó la importación de Notion. Se compara como conjunto para
 * que reordenar no cuente como cambio.
 */
export function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}
