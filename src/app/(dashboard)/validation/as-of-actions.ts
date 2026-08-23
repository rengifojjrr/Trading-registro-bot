"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { reconstructAsOf, type AsOfResult } from "@/lib/reconstruction/as-of";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha tiene que ser AAAA-MM-DD."),
});

export interface AsOfState {
  error: string | null;
  result: AsOfResult | null;
}

/**
 * Rehace el historial a una fecha, sin escribir nada.
 *
 * Corre el mismo motor de reconstrucción sobre los fills que existían hasta esa
 * fecha, en memoria. Guardar el resultado sería reescribir la reconstrucción
 * actual con una vista parcial -- exactamente el fallo que esto detecta.
 */
export async function rebuildAsOf(_prev: AsOfState, formData: FormData): Promise<AsOfState> {
  const parsed = schema.safeParse({ date: formData.get("date") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Fecha inválida.", result: null };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: settings }, { data: account }] = await Promise.all([
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .eq("is_demo", false)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!account) {
    return { error: "Todavía no hay ninguna cuenta conectada que reconstruir.", result: null };
  }

  const result = await reconstructAsOf({
    userId: user.id,
    accountId: account.id,
    date: parsed.data.date,
    timezone: settings?.timezone || "UTC",
  });

  if ("error" in result) return { error: result.error, result: null };
  return { error: null, result };
}
