"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { moveToTrash } from "@/core/trash";
import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { SETUP_GRADES } from "@/lib/journal/setup-grade";
import { applySetupGrade } from "@/lib/journal/setup-tags";
import { enqueueNotionSync } from "@/lib/notion/sync";
import { createClient } from "@/lib/supabase/server";

const optionalText = (max: number) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.string().max(max).optional());

const optionalNumber = () =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().optional());

const optionalRating = () =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(1).max(5).optional());

// Checkbox groups (Emociones/Errores) submit one FormData entry per checked
// box under the same field name -- stored comma-joined, same convention the
// Notion import used (see docs/NOTION_IMPORT.md), so both sources read back
// identically.
const checkboxList = (maxLen: number) => z.array(z.string().max(maxLen)).max(20);

const schema = z.object({
  tradeId: z.string().uuid(),
  strategy_id: z.preprocess((v) => (v === "" || v === "NONE" ? undefined : v), z.string().uuid().optional()),
  setup_grade: z.preprocess(
    (v) => (v === "" || v === "NONE" ? undefined : v),
    z.enum(SETUP_GRADES).optional(),
  ),
  htf_bias: optionalText(200),
  sr_proximity: optionalText(200),
  planned_direction: z.preprocess((v) => (v === "" ? "NONE" : v), z.enum(["LONG", "SHORT", "NONE"])),
  risk_amount: optionalNumber(),
  stop_loss_price: optionalNumber(),
  take_profit_price: optionalNumber(),
  result_r: optionalNumber(),
  plan_adherence: optionalRating(),
  entry_quality: optionalRating(),
  emotional_state: checkboxList(200),
  mistake_tag: checkboxList(200),
  lesson_learned: optionalText(2000),
  notes: optionalText(5000),
});

export type JournalFormState = { error: string | null; success: boolean };

/**
 * Upserts the *subjective* half of a trade -- everything an objective
 * Coinbase fill can never tell you (planned direction, emotional state,
 * lesson learned...). Kept in its own table with its own action so it can
 * never accidentally touch the reconstructed trade row itself.
 */
export async function saveJournalEntry(
  _prevState: JournalFormState,
  formData: FormData,
): Promise<JournalFormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    tradeId: formData.get("tradeId"),
    strategy_id: formData.get("strategy_id"),
    setup_grade: formData.get("setup_grade"),
    htf_bias: formData.get("htf_bias"),
    sr_proximity: formData.get("sr_proximity"),
    planned_direction: formData.get("planned_direction"),
    risk_amount: formData.get("risk_amount"),
    stop_loss_price: formData.get("stop_loss_price"),
    take_profit_price: formData.get("take_profit_price"),
    result_r: formData.get("result_r"),
    plan_adherence: formData.get("plan_adherence"),
    entry_quality: formData.get("entry_quality"),
    emotional_state: formData.getAll("emotional_state"),
    mistake_tag: formData.getAll("mistake_tag"),
    lesson_learned: formData.get("lesson_learned"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const { tradeId, ...fields } = parsed.data;
  const supabase = await createClient();

  // RLS would block a cross-user write anyway, but checking first gives a
  // real error message instead of a silent RLS-denied no-op.
  const { data: trade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!trade) {
    return { error: "Operación no encontrada.", success: false };
  }

  const { error } = await supabase.from("journal_entries").upsert(
    {
      user_id: user.id,
      trade_id: tradeId,
      strategy_id: fields.strategy_id ?? null,
      htf_bias: fields.htf_bias ?? null,
      sr_proximity: fields.sr_proximity ?? null,
      planned_direction: fields.planned_direction,
      risk_amount: fields.risk_amount ?? null,
      stop_loss_price: fields.stop_loss_price ?? null,
      take_profit_price: fields.take_profit_price ?? null,
      result_r: fields.result_r ?? null,
      plan_adherence: fields.plan_adherence ?? null,
      entry_quality: fields.entry_quality ?? null,
      emotional_state: fields.emotional_state.length > 0 ? fields.emotional_state.join(", ") : null,
      mistake_tag: fields.mistake_tag.length > 0 ? fields.mistake_tag.join(", ") : null,
      lesson_learned: fields.lesson_learned ?? null,
      notes: fields.notes ?? null,
    },
    { onConflict: "trade_id" },
  );

  if (error) {
    return { error: "No se pudo guardar el diario.", success: false };
  }

  await applySetupGrade({ userId: user.id, tradeIds: [tradeId], grade: fields.setup_grade ?? null });
  await enqueueNotionSync(user.id, tradeId);

  revalidatePath(`/trades/${tradeId}`);
  return { error: null, success: true };
}

const commentSchema = z.object({
  tradeId: z.string().uuid(),
  body: z.string().trim().min(1, "El comentario no puede estar vacío.").max(2000),
});

export type CommentFormState = { error: string | null; success: boolean };

/**
 * Free-form notes on a trade, separate from journal_entries -- an ongoing
 * timestamped log (e.g. "moved stop to breakeven") rather than the single
 * structured record journal_entries holds. Not mirrored to Notion: the
 * outbound mirror only covers the specific journal fields the original
 * Notion template had (see docs/NOTION_IMPORT.md); comments are new.
 */
export async function addComment(_prevState: CommentFormState, formData: FormData): Promise<CommentFormState> {
  const user = await requireUser();

  const parsed = commentSchema.safeParse({
    tradeId: formData.get("tradeId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", parsed.data.tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!trade) {
    return { error: "Operación no encontrada.", success: false };
  }

  const { error } = await supabase
    .from("trade_comments")
    .insert({ user_id: user.id, trade_id: parsed.data.tradeId, body: parsed.data.body });
  if (error) {
    return { error: "No se pudo guardar el comentario.", success: false };
  }

  revalidatePath(`/trades/${parsed.data.tradeId}`);
  return { error: null, success: true };
}

export async function deleteComment(tradeId: string, commentId: string, _formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase.from("trade_comments").delete().eq("id", commentId).eq("trade_id", tradeId).eq("user_id", user.id);

  revalidatePath(`/trades/${tradeId}`);
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const SCREENSHOT_PHASES = ["BEFORE", "AFTER", "OTHER"] as const;

const uploadScreenshotSchema = z.object({
  tradeId: z.string().uuid(),
  caption: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(500).optional()),
  phase: z.preprocess((v) => (v === "" || v === undefined ? "OTHER" : v), z.enum(SCREENSHOT_PHASES)),
});

export type ScreenshotFormState = { error: string | null; success: boolean };

/**
 * Uploads directly to the private `trade-screenshots` Storage bucket (RLS
 * on storage.objects requires the {user_id}/... path prefix -- see
 * supabase/migrations/20260811121100_storage.sql) then records the
 * trade_screenshots row pointing at it. If the row insert fails after a
 * successful upload, the just-uploaded object is removed rather than left
 * as an orphan no UI could ever show or delete again.
 */
export async function uploadTradeScreenshot(
  _prevState: ScreenshotFormState,
  formData: FormData,
): Promise<ScreenshotFormState> {
  const user = await requireUser();

  const parsed = uploadScreenshotSchema.safeParse({
    tradeId: formData.get("tradeId"),
    caption: formData.get("caption"),
    phase: formData.get("phase"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecciona una imagen.", success: false };
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return { error: "La imagen no puede superar 5 MB.", success: false };
  }
  const extension = SCREENSHOT_MIME_EXTENSIONS[file.type];
  if (!extension) {
    return { error: "Formato no soportado -- usa PNG, JPG o WEBP.", success: false };
  }

  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", parsed.data.tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!trade) {
    return { error: "Operación no encontrada.", success: false };
  }

  const storagePath = `${user.id}/${parsed.data.tradeId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("trade-screenshots")
    .upload(storagePath, file, { contentType: file.type });
  if (uploadError) {
    return { error: "No se pudo subir la imagen.", success: false };
  }

  const { error: insertError } = await supabase.from("trade_screenshots").insert({
    user_id: user.id,
    trade_id: parsed.data.tradeId,
    storage_path: storagePath,
    caption: parsed.data.caption ?? null,
    phase: parsed.data.phase,
  });
  if (insertError) {
    await supabase.storage.from("trade-screenshots").remove([storagePath]);
    return { error: "No se pudo guardar la captura.", success: false };
  }

  revalidatePath(`/trades/${parsed.data.tradeId}`);
  return { error: null, success: true };
}

export async function deleteTradeScreenshot(
  tradeId: string,
  screenshotId: string,
  storagePath: string,
  _formData: FormData,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("trade_screenshots")
    .delete()
    .eq("id", screenshotId)
    .eq("trade_id", tradeId)
    .eq("user_id", user.id);

  if (!error) {
    await supabase.storage.from("trade-screenshots").remove([storagePath]);
  }

  revalidatePath(`/trades/${tradeId}`);
}

/**
 * Sources whose trades a person entered themselves, directly or through an
 * import, and can therefore remove.
 *
 * COINBASE_SYNC is deliberately absent. Those trades are derived from
 * raw_fills by the reconstruction engine, so deleting one achieves nothing:
 * the next sync recomputes it from the same fills and it comes straight
 * back. The remedy there is to correct the inputs -- exclude a fill or add
 * a grouping override -- not to delete the output.
 */
const DELETABLE_SOURCES = ["NOTION_IMPORT", "CSV_IMPORT", "MANUAL", "DEMO_SEED"] as const;

/**
 * Archiva una operación con todo lo que cuelga de ella.
 *
 * Antes la borraba de verdad, y con ella se iba la entrada de diario escrita
 * sobre ella -- que suele valer más que los números. Los siete módulos de vida
 * llevaban meses borrando con red debajo, así que la asimetría iba al revés de
 * lo razonable: la red estaba puesta donde menos se pierde y quitada donde más.
 *
 * Ahora va a la misma papelera que todo lo demás: se puede deshacer al momento
 * desde el aviso, o recuperar durante treinta días desde Papelera.
 *
 * Devuelve el identificador de la entrada de papelera, que es lo que el aviso
 * de «deshacer» necesita.
 */
export async function deleteTrade(
  tradeId: string,
): Promise<{ error: string | null; trashId?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id, product_id, direction, status, source, opened_at, closed_at, max_size, net_pnl")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!trade) return { error: "Operación no encontrada." };

  if (!DELETABLE_SOURCES.includes(trade.source as (typeof DELETABLE_SOURCES)[number])) {
    return {
      error:
        "Esta operación la reconstruye el motor a partir de los fills de Coinbase, así que volvería a aparecer en la próxima sincronización. Para cambiarla, corrige los fills en lugar de borrarla.",
    };
  }

  const { count: journalCount } = await supabase
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("trade_id", tradeId);

  const trashId = await moveToTrash("OPERACION", tradeId);
  if (!trashId) return { error: "No se pudo borrar la operación." };

  await recordAudit({
    userId: user.id,
    action: "TRADE_DELETED",
    entityType: "trade",
    entityId: tradeId,
    metadata: {
      product_id: trade.product_id,
      direction: trade.direction,
      source: trade.source,
      opened_at: trade.opened_at,
      closed_at: trade.closed_at,
      max_size: trade.max_size,
      net_pnl: trade.net_pnl,
      journal_entries_archived: journalCount ?? 0,
      trash_id: trashId,
    },
  });

  revalidatePath("/trades");
  revalidatePath("/papelera");
  revalidatePath("/");
  return { error: null, trashId };
}
