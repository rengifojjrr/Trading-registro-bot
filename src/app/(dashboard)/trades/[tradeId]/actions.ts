"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const optionalText = (max: number) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.string().max(max).optional());

const optionalNumber = () =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().optional());

const optionalRating = () =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(1).max(5).optional());

const schema = z.object({
  tradeId: z.string().uuid(),
  strategy_id: z.preprocess((v) => (v === "" || v === "NONE" ? undefined : v), z.string().uuid().optional()),
  htf_bias: optionalText(200),
  sr_proximity: optionalText(200),
  planned_direction: z.preprocess((v) => (v === "" ? "NONE" : v), z.enum(["LONG", "SHORT", "NONE"])),
  risk_amount: optionalNumber(),
  stop_loss_price: optionalNumber(),
  take_profit_price: optionalNumber(),
  result_r: optionalNumber(),
  plan_adherence: optionalRating(),
  entry_quality: optionalRating(),
  emotional_state: optionalText(200),
  mistake_tag: optionalText(200),
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
    htf_bias: formData.get("htf_bias"),
    sr_proximity: formData.get("sr_proximity"),
    planned_direction: formData.get("planned_direction"),
    risk_amount: formData.get("risk_amount"),
    stop_loss_price: formData.get("stop_loss_price"),
    take_profit_price: formData.get("take_profit_price"),
    result_r: formData.get("result_r"),
    plan_adherence: formData.get("plan_adherence"),
    entry_quality: formData.get("entry_quality"),
    emotional_state: formData.get("emotional_state"),
    mistake_tag: formData.get("mistake_tag"),
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
      emotional_state: fields.emotional_state ?? null,
      mistake_tag: fields.mistake_tag ?? null,
      lesson_learned: fields.lesson_learned ?? null,
      notes: fields.notes ?? null,
    },
    { onConflict: "trade_id" },
  );

  if (error) {
    return { error: "No se pudo guardar el diario.", success: false };
  }

  revalidatePath(`/trades/${tradeId}`);
  return { error: null, success: true };
}
