"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import {
  planBulkApply,
  splitList,
  type BulkMode,
  type BulkPlan,
  type BulkValues,
  type ExistingJournal,
} from "@/lib/journal/bulk-apply";
import { burstContaining, DEFAULT_GAP_MINUTES } from "@/lib/journal/bursts";
import { MISTAKE_CODES, type MistakeCode } from "@/lib/journal/mistakes";
import { SETUP_GRADES } from "@/lib/journal/setup-grade";
import { applySetupGrade, readSetupGrades } from "@/lib/journal/setup-tags";
import { createClient } from "@/lib/supabase/server";

/** Un tope para que un clic no dispare una escritura de miles de filas. */
const MAX_TRADES = 100;

const valuesSchema = z.object({
  strategy_id: z.uuid().nullish(),
  setup_grade: z.enum(SETUP_GRADES).optional(),
  // Sin `NONE`: elegirlo para doce operaciones sería borrar la dirección que
  // ya tuvieran, y este cuadro no borra nada.
  planned_direction: z.enum(["LONG", "SHORT"]).optional(),
  emotional_state: z.array(z.string().max(200)).max(20).optional(),
  mistake_tag: z.array(z.string().max(200)).max(20).optional(),
  mistakes: z.array(z.enum(MISTAKE_CODES)).max(MISTAKE_CODES.length).optional(),
  lesson_learned: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  plan_adherence: z.number().int().min(1).max(5).optional(),
  entry_quality: z.number().int().min(1).max(5).optional(),
  htf_bias: z.string().max(200).optional(),
  sr_proximity: z.string().max(200).optional(),
});

const requestSchema = z.object({
  tradeIds: z.array(z.uuid()).min(1).max(MAX_TRADES),
  values: valuesSchema,
  mode: z.enum(["FILL_EMPTY", "OVERWRITE"]),
});

export interface BulkApplyResult {
  error: string | null;
  plan: BulkPlan | null;
  applied: boolean;
}

/**
 * Apunta lo mismo en varias operaciones a la vez.
 *
 * El caso que lo justifica: doce entradas en veinte minutos no son doce
 * decisiones, son una repetida. Apuntarlas obliga a escribir «FOMO» doce
 * veces, así que el episodio que más caro sale es el que se queda sin apuntar.
 *
 * Se llama dos veces: primero con `dryRun` para enseñar qué se va a cambiar y
 * cuánto se va a pisar, y luego para hacerlo. El aviso no es una formalidad --
 * «se van a reemplazar 3 notas» es lo que hace que alguien cambie de opinión.
 *
 * Lo que **no** se puede aplicar en bloque: riesgo, stop, objetivo y resultado
 * en R. Son números de cada operación, y ponerle el mismo stop a doce entradas
 * distintas no es cómodo, es falso.
 */
export async function applyJournalToTrades(input: {
  tradeIds: string[];
  values: BulkValues;
  mode: BulkMode;
  dryRun?: boolean;
}): Promise<BulkApplyResult> {
  const parsed = requestSchema.safeParse({
    tradeIds: input.tradeIds,
    values: input.values,
    mode: input.mode,
  });

  if (!parsed.success) {
    return {
      error:
        input.tradeIds.length > MAX_TRADES
          ? `Son demasiadas de una vez (${input.tradeIds.length}). El tope es ${MAX_TRADES}.`
          : (parsed.error.issues[0]?.message ?? "Datos inválidos."),
      plan: null,
      applied: false,
    };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { tradeIds, values, mode } = parsed.data;

  // Que las operaciones sean suyas se comprueba antes de escribir nada. RLS lo
  // impediría igual, pero un error claro vale más que un no-op silencioso.
  const { data: trades } = await supabase
    .from("trades")
    .select("id")
    .eq("user_id", user.id)
    .is("orphaned_at", null)
    .in("id", tradeIds);

  const propias = (trades ?? []).map((t) => t.id);
  if (propias.length === 0) {
    return { error: "Ninguna de esas operaciones existe.", plan: null, applied: false };
  }

  const existing = await readExisting(propias, user.id);
  const plan = planBulkApply({ existing, values: values as BulkValues, mode });

  if (input.dryRun) return { error: null, plan, applied: false };
  if (plan.totalWrites === 0) return { error: null, plan, applied: false };

  const escrituras = await write({
    userId: user.id,
    existing,
    values: values as BulkValues,
    mode,
  });

  if (escrituras.error) return { error: escrituras.error, plan, applied: false };

  await recordAudit({
    userId: user.id,
    action: "JOURNAL_SAVED",
    entityType: "trade",
    entityId: propias[0],
    metadata: {
      en_bloque: true,
      operaciones: propias.length,
      campos: plan.fields.map((f) => f.field),
      modo: mode,
      reemplazos: plan.totalOverwrites,
    },
  });

  revalidatePath("/trades");
  revalidatePath("/journal");
  revalidatePath("/behaviour");
  for (const id of propias) revalidatePath(`/trades/${id}`);

  return { error: null, plan, applied: true };
}

/**
 * Las operaciones del mismo episodio que una dada.
 *
 * Es lo que necesita «seleccionar toda la ráfaga»: se pulsa sobre una y salen
 * todas las de esos mismos minutos. Solo mira el mismo producto, porque dos
 * instrumentos a la vez son dos decisiones distintas.
 */
export async function findBurstFor(
  tradeId: string,
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): Promise<{ tradeIds: string[]; spanMinutes: number } | null> {
  if (!z.uuid().safeParse(tradeId).success) return null;

  const user = await requireUser();
  const supabase = await createClient();

  const { data: ancla } = await supabase
    .from("trades")
    .select("opened_at, product_id")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ancla) return null;

  // Una ventana amplia alrededor: la ráfaga se decide por los huecos entre
  // operaciones consecutivas, así que hace falta traer vecinas suficientes
  // para que el hueco de los extremos se pueda medir de verdad.
  const margenMs = Math.max(gapMinutes, DEFAULT_GAP_MINUTES) * 60 * 1000 * 20;
  const centro = Date.parse(ancla.opened_at);

  const { data: vecinas } = await supabase
    .from("trades")
    .select("id, opened_at, product_id")
    .eq("user_id", user.id)
    .eq("product_id", ancla.product_id)
    .is("orphaned_at", null)
    .gte("opened_at", new Date(centro - margenMs).toISOString())
    .lte("opened_at", new Date(centro + margenMs).toISOString())
    .order("opened_at")
    .limit(500);

  const burst = burstContaining(
    tradeId,
    (vecinas ?? []).map((t) => ({ id: t.id, openedAt: t.opened_at, productId: t.product_id })),
    gapMinutes,
  );

  if (!burst) return null;
  return { tradeIds: burst.tradeIds.slice(0, MAX_TRADES), spanMinutes: burst.spanMinutes };
}

async function readExisting(tradeIds: string[], userId: string): Promise<ExistingJournal[]> {
  const supabase = await createClient();

  const [{ data: journals }, { data: mistakes }, setupGrades] = await Promise.all([
    supabase
      .from("journal_entries")
      .select(
        "trade_id, strategy_id, planned_direction, emotional_state, mistake_tag, lesson_learned, notes, plan_adherence, entry_quality, htf_bias, sr_proximity",
      )
      .eq("user_id", userId)
      .in("trade_id", tradeIds),
    supabase
      .from("trade_mistakes")
      .select("trade_id, mistake_code")
      .eq("user_id", userId)
      .in("trade_id", tradeIds),
    // La nota del setup no es una columna: vive como etiqueta, igual que la
    // dejó la importación de Notion.
    readSetupGrades(userId, tradeIds),
  ]);

  const porOperacion = new Map((journals ?? []).map((j) => [j.trade_id, j]));
  const erroresPorOperacion = new Map<string, MistakeCode[]>();
  for (const m of mistakes ?? []) {
    const lista = erroresPorOperacion.get(m.trade_id) ?? [];
    lista.push(m.mistake_code as MistakeCode);
    erroresPorOperacion.set(m.trade_id, lista);
  }

  return tradeIds.map((tradeId) => {
    const j = porOperacion.get(tradeId);
    return {
      tradeId,
      strategy_id: j?.strategy_id ?? null,
      setup_grade: setupGrades.get(tradeId) ?? null,
      planned_direction: j?.planned_direction ?? null,
      emotional_state: j?.emotional_state ?? null,
      mistake_tag: j?.mistake_tag ?? null,
      lesson_learned: j?.lesson_learned ?? null,
      notes: j?.notes ?? null,
      plan_adherence: j?.plan_adherence ?? null,
      entry_quality: j?.entry_quality ?? null,
      htf_bias: j?.htf_bias ?? null,
      sr_proximity: j?.sr_proximity ?? null,
      mistakes: erroresPorOperacion.get(tradeId) ?? [],
    };
  });
}

/**
 * Escribe operación por operación, respetando el modo.
 *
 * Se hace un upsert por fila y no uno masivo a propósito: en modo «rellenar lo
 * vacío» cada fila conserva campos distintos, y un upsert masivo con un mismo
 * objeto los igualaría todos -- que es justo lo que el modo existe para evitar.
 */
async function write(params: {
  userId: string;
  existing: ExistingJournal[];
  values: BulkValues;
  mode: BulkMode;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { userId, existing, values, mode } = params;

  const conservar = <T>(actual: T, nuevo: T | undefined, tenia: boolean): T => {
    if (nuevo === undefined) return actual;
    if (mode === "FILL_EMPTY" && tenia) return actual;
    return nuevo;
  };

  for (const row of existing) {
    const emociones = values.emotional_state;
    const etiquetas = values.mistake_tag;

    const payload = {
      user_id: userId,
      trade_id: row.tradeId,
      strategy_id: conservar(row.strategy_id, values.strategy_id, row.strategy_id !== null),
      // `NONE` es «sin definir» y no cuenta como que ya tuviera dirección: si
      // contara, «rellenar solo lo vacío» se saltaría justo las que hay que
      // rellenar.
      planned_direction: conservar(
        row.planned_direction,
        values.planned_direction,
        row.planned_direction !== null && row.planned_direction !== "NONE",
      ),
      emotional_state: conservar(
        row.emotional_state,
        emociones && emociones.length > 0 ? emociones.join(", ") : undefined,
        splitList(row.emotional_state).length > 0,
      ),
      mistake_tag: conservar(
        row.mistake_tag,
        etiquetas && etiquetas.length > 0 ? etiquetas.join(", ") : undefined,
        splitList(row.mistake_tag).length > 0,
      ),
      lesson_learned: conservar(
        row.lesson_learned,
        emptyToUndefined(values.lesson_learned),
        (row.lesson_learned ?? "").trim() !== "",
      ),
      notes: conservar(row.notes, emptyToUndefined(values.notes), (row.notes ?? "").trim() !== ""),
      plan_adherence: conservar(
        row.plan_adherence,
        values.plan_adherence,
        row.plan_adherence !== null,
      ),
      entry_quality: conservar(row.entry_quality, values.entry_quality, row.entry_quality !== null),
      htf_bias: conservar(
        row.htf_bias,
        emptyToUndefined(values.htf_bias),
        (row.htf_bias ?? "").trim() !== "",
      ),
      sr_proximity: conservar(
        row.sr_proximity,
        emptyToUndefined(values.sr_proximity),
        (row.sr_proximity ?? "").trim() !== "",
      ),
    };

    const { error } = await supabase
      .from("journal_entries")
      .upsert(payload, { onConflict: "trade_id" });

    if (error) return { error: `No se pudo apuntar una de las operaciones: ${error.message}` };

    // Los errores estructurados van en su propia tabla, que es la que cuenta
    // Comportamiento. Escribirlos solo en el texto libre del diario los dejaría
    // fuera de «qué error me cuesta más dinero», que es para lo que sirven.
    const nuevosErrores = values.mistakes;
    const escribirErrores =
      nuevosErrores !== undefined &&
      nuevosErrores.length > 0 &&
      !(mode === "FILL_EMPTY" && row.mistakes.length > 0);

    if (escribirErrores) {
      const { error: errorErrores } = await supabase.from("trade_mistakes").upsert(
        nuevosErrores.map((code) => ({ user_id: userId, trade_id: row.tradeId, mistake_code: code })),
        { onConflict: "trade_id,mistake_code", ignoreDuplicates: true },
      );
      if (errorErrores) {
        return { error: `No se pudieron guardar los errores: ${errorErrores.message}` };
      }
    }
  }

  /**
   * La nota del setup, al final y de una vez.
   *
   * Va fuera del bucle porque escribirla es reemplazar una etiqueta, no
   * actualizar una fila: hacerlo operación por operación serían tres consultas
   * por cada una para acabar poniendo la misma etiqueta. Aquí se hace una vez
   * para todas las que la reciben.
   */
  if (values.setup_grade !== undefined) {
    const destinatarias = existing
      .filter((row) => !(mode === "FILL_EMPTY" && row.setup_grade !== null))
      .filter((row) => row.setup_grade !== values.setup_grade)
      .map((row) => row.tradeId);

    if (destinatarias.length > 0) {
      const { error } = await applySetupGrade({
        userId,
        tradeIds: destinatarias,
        grade: values.setup_grade,
      });
      if (error) return { error };
    }
  }

  return { error: null };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.trim() === "" ? undefined : value;
}
