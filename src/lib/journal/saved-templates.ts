import type { Json } from "@/types/database";

import type { BulkValues } from "./bulk-apply";
import { MISTAKE_CODES, type MistakeCode } from "./mistakes";
import { isSetupGrade } from "./setup-grade";

/**
 * Leer una plantilla guardada sin fiarse de lo que hay en la columna.
 *
 * `journal_templates.values` es `jsonb`: la restricción de la tabla garantiza
 * que es un objeto y nada más. Una plantilla guardada hace meses puede traer
 * un campo que ya no existe, o un código de error que se retiró del
 * vocabulario, y aplicarla a ciegas escribiría basura en el diario -- o
 * fallaría en el momento exacto en que alguien está intentando apuntar rápido.
 *
 * Se lee campo a campo y se descarta lo que no encaje. Una plantilla a la que
 * le falta un trozo sigue sirviendo; una que revienta, no.
 *
 * Puro: no toca base de datos.
 */

export interface JournalTemplateRow {
  id: string;
  name: string;
  values: BulkValues;
  useCount: number;
}

export function parseTemplateValues(raw: Json | Record<string, unknown>): BulkValues {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const salida: BulkValues = {};

  const mistakes = stringArray(obj.mistakes).filter((m): m is MistakeCode =>
    (MISTAKE_CODES as readonly string[]).includes(m),
  );
  if (mistakes.length > 0) salida.mistakes = mistakes;

  const emociones = stringArray(obj.emotional_state);
  if (emociones.length > 0) salida.emotional_state = emociones;

  const etiquetas = stringArray(obj.mistake_tag);
  if (etiquetas.length > 0) salida.mistake_tag = etiquetas;

  // La estrategia se guarda por id, así que puede apuntar a una archivada o
  // borrada. Se conserva: al aplicar, la comprobación de propiedad decide.
  if (typeof obj.strategy_id === "string" && obj.strategy_id !== "") {
    salida.strategy_id = obj.strategy_id;
  }

  const notas = text(obj.notes, 5000);
  if (notas) salida.notes = notas;

  const leccion = text(obj.lesson_learned, 2000);
  if (leccion) salida.lesson_learned = leccion;

  if (isSetupGrade(obj.setup_grade)) salida.setup_grade = obj.setup_grade;

  // Sin `NONE`: una plantilla que ponga «sin definir» borraría la dirección
  // que ya tuvieran las operaciones, y aplicar una plantilla no borra nada.
  if (obj.planned_direction === "LONG" || obj.planned_direction === "SHORT") {
    salida.planned_direction = obj.planned_direction;
  }

  const htf = text(obj.htf_bias, 200);
  if (htf) salida.htf_bias = htf;

  const sr = text(obj.sr_proximity, 200);
  if (sr) salida.sr_proximity = sr;

  const adherencia = rating(obj.plan_adherence);
  if (adherencia !== null) salida.plan_adherence = adherencia;

  const calidad = rating(obj.entry_quality);
  if (calidad !== null) salida.entry_quality = calidad;

  return salida;
}

/** Cuántos campos trae, para poder decirlo en la lista sin abrirla. */
export function describeTemplate(values: BulkValues): string {
  const partes: string[] = [];

  if (values.mistakes?.length) partes.push(`${values.mistakes.length} error(es)`);
  if (values.emotional_state?.length) partes.push(`${values.emotional_state.length} emoción(es)`);
  if (values.strategy_id) partes.push("estrategia");
  if (values.setup_grade) partes.push(`setup ${values.setup_grade}`);
  if (values.planned_direction) partes.push("dirección");
  if (values.htf_bias) partes.push("sesgo");
  if (values.sr_proximity) partes.push("soporte/resistencia");
  if (values.plan_adherence !== undefined) partes.push("adherencia");
  if (values.entry_quality !== undefined) partes.push("calidad de entrada");
  if (values.notes) partes.push("notas");
  if (values.lesson_learned) partes.push("lección");

  return partes.length === 0 ? "Vacía" : partes.join(" · ");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "")
    .slice(0, 20);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const limpio = value.trim();
  return limpio === "" ? undefined : limpio.slice(0, max);
}

function rating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= 5 ? value : null;
}
