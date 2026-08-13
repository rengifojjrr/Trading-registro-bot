"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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

  revalidatePath("/strategies");
  return { error: null, success: true };
}
