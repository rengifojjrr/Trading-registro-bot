"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { isMistakeCode } from "@/lib/journal/mistakes";
import { createClient } from "@/lib/supabase/server";

/**
 * Tagging what went wrong, and ticking the playbook.
 *
 * Both are deliberately separate from the journal form: the journal is
 * prose you write once, these are structured facts that have to stay
 * countable. "Entré tarde" typed three different ways is three things to a
 * database and one to a person, and only the countable version can tell you
 * which mistake costs the most.
 */

export async function toggleMistake(
  tradeId: string,
  code: string,
  active: boolean,
): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(tradeId).success) return { error: "Operación inválida." };
  if (!isMistakeCode(code)) return { error: "Error no reconocido." };

  const supabase = await createClient();

  // Ownership is enforced by RLS on the insert/delete; this read only
  // decides whether to report "not found" instead of a policy error.
  const { data: trade } = await supabase
    .from("trades")
    .select("id")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!trade) return { error: "Operación no encontrada." };

  if (active) {
    const { error } = await supabase
      .from("trade_mistakes")
      .upsert({ user_id: user.id, trade_id: tradeId, mistake_code: code }, { onConflict: "trade_id,mistake_code" });
    if (error) return { error: "No se pudo guardar el error." };
  } else {
    const { error } = await supabase
      .from("trade_mistakes")
      .delete()
      .eq("trade_id", tradeId)
      .eq("mistake_code", code)
      .eq("user_id", user.id);
    if (error) return { error: "No se pudo quitar el error." };
  }

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/behaviour");
  return { error: null };
}

export async function togglePlaybookCheck(
  tradeId: string,
  playbookItemId: string,
  checked: boolean,
): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(tradeId).success) return { error: "Operación inválida." };
  if (!z.uuid().safeParse(playbookItemId).success) return { error: "Punto inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("trade_playbook_checks").upsert(
    { user_id: user.id, trade_id: tradeId, playbook_item_id: playbookItemId, checked },
    { onConflict: "trade_id,playbook_item_id" },
  );

  if (error) return { error: "No se pudo guardar." };

  revalidatePath(`/trades/${tradeId}`);
  return { error: null };
}

const itemSchema = z.object({
  strategyId: z.uuid(),
  label: z.string().trim().min(1, "Escribe en qué consiste el punto.").max(200),
});

/** Adds one rule to a strategy's pre-entry checklist. */
export async function addPlaybookItem(input: unknown): Promise<{ error: string | null }> {
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("playbook_items")
    .select("id", { count: "exact", head: true })
    .eq("strategy_id", parsed.data.strategyId)
    .eq("user_id", user.id);

  const { error } = await supabase.from("playbook_items").insert({
    user_id: user.id,
    strategy_id: parsed.data.strategyId,
    label: parsed.data.label,
    sort_order: count ?? 0,
  });

  if (error) return { error: "No se pudo añadir el punto." };

  await recordAudit({
    userId: user.id,
    action: "STRATEGY_UPDATED",
    entityType: "playbook_item",
    entityId: parsed.data.strategyId,
    metadata: { added: parsed.data.label },
  });

  revalidatePath("/strategies");
  return { error: null };
}

export async function deletePlaybookItem(itemId: string): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(itemId).success) return { error: "Punto inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo eliminar el punto." };

  revalidatePath("/strategies");
  return { error: null };
}
