"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks a difference as dealt with.
 *
 * Deliberately does not touch any trade, fill or figure. The app has no way
 * to know which of the two versions is correct -- that is the human's call,
 * and the note is where they record it. "Resolved" here means "a person
 * looked at this", not "the data was changed".
 */
export async function resolveDiscrepancy(
  discrepancyId: string,
  note: string,
): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(discrepancyId).success) return { error: "Diferencia inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reconciliation_discrepancies")
    .update({
      resolved_at: new Date().toISOString(),
      resolution_note: note.trim().slice(0, 500) || null,
    })
    .eq("id", discrepancyId)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo marcar como resuelta." };

  revalidatePath("/reconciliation");
  revalidatePath("/activity");
  return { error: null };
}
