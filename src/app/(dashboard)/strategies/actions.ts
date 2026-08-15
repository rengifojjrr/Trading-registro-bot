"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la estrategia.").max(120, "El nombre es demasiado largo."),
  description: z.string().trim().max(2000).optional(),
});

export type StrategyFormState = { error: string | null; success: boolean };

/**
 * Creating a strategy previously had no UI at all: the Estrategias page
 * told you to "define a strategy" but a row could only appear by writing
 * to the database directly, so the empty state was a dead end.
 */
export async function createStrategy(
  _prevState: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("strategies").insert({
    user_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    is_active: true,
  });

  if (error) {
    // 23505 is Postgres' unique_violation -- the schema keeps strategy
    // names unique per user, so this is the expected duplicate-name path
    // rather than an unexpected failure.
    if (error.code === "23505") {
      return { error: "Ya tienes una estrategia con ese nombre.", success: false };
    }
    return { error: "No se pudo crear la estrategia.", success: false };
  }

  await recordAudit({
    userId: user.id,
    action: "STRATEGY_CREATED",
    entityType: "strategy",
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/strategies");
  return { error: null, success: true };
}

const updateSchema = schema.extend({ id: z.uuid() });

/** Renames a strategy / edits its rules. Trades keep pointing at the same row, so history isn't rewritten. */
export async function updateStrategy(
  _prevState: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const user = await requireUser();

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("strategies")
    .update({ name: parsed.data.name, description: parsed.data.description ?? null })
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya tienes una estrategia con ese nombre.", success: false };
    }
    return { error: "No se pudo guardar la estrategia.", success: false };
  }

  await recordAudit({
    userId: user.id,
    action: "STRATEGY_UPDATED",
    entityType: "strategy",
    entityId: parsed.data.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/strategies");
  return { error: null, success: true };
}

/**
 * Archives a strategy instead of deleting it. Trades that reference it keep
 * their history intact -- deleting would either orphan them or silently
 * rewrite what strategy a past trade was taken under, which is exactly the
 * kind of retroactive edit this app avoids everywhere else.
 */
export async function setStrategyActive(strategyId: string, isActive: boolean): Promise<void> {
  const user = await requireUser();
  if (!z.uuid().safeParse(strategyId).success) return;

  const supabase = await createClient();
  await supabase
    .from("strategies")
    .update({ is_active: isActive })
    .eq("id", strategyId)
    .eq("user_id", user.id);

  revalidatePath("/strategies");
}

/**
 * Permanently removes a strategy. Only allowed when nothing references it;
 * otherwise the caller is told to archive instead, so a delete can never
 * quietly detach historical trades from the strategy they were taken under.
 */
export async function deleteStrategy(strategyId: string): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(strategyId).success) return { error: "Estrategia inválida." };

  const supabase = await createClient();

  const { count } = await supabase
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("strategy_id", strategyId);

  if (count && count > 0) {
    return {
      error: `No se puede borrar: ${count} operación(es) la usan. Archívala para dejar de verla sin perder ese historial.`,
    };
  }

  const { error } = await supabase.from("strategies").delete().eq("id", strategyId).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar la estrategia." };

  await recordAudit({
    userId: user.id,
    action: "STRATEGY_DELETED",
    entityType: "strategy",
    entityId: strategyId,
  });

  revalidatePath("/strategies");
  return { error: null };
}
