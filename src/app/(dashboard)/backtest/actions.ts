"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";
import { costsSchema, strategySchema } from "@/lib/backtest/persistence";
import { validateStrategy } from "@/lib/backtest/rules";
import { DEFAULT_COSTS, type Strategy } from "@/lib/backtest/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Guardar y borrar estrategias de backtest.
 *
 * La validación de las reglas es la misma función que usa la pantalla antes de
 * dejarte correr el backtest (`validateStrategy`). Dos validaciones distintas
 * -- una amable en el cliente y otra en el servidor -- acaban discrepando, y
 * el síntoma es un formulario que deja guardar algo que luego no se puede
 * ejecutar.
 */

export interface StrategyFormState {
  error: string | null;
  savedId: string | null;
}

export async function saveBacktestStrategy(
  _prev: StrategyFormState,
  formData: FormData,
): Promise<StrategyFormState> {
  const user = await requireUser();

  let crudo: unknown;
  let costesCrudo: unknown;
  try {
    crudo = JSON.parse(String(formData.get("strategy") ?? "null"));
    costesCrudo = JSON.parse(String(formData.get("costs") ?? "null"));
  } catch {
    return { error: "No se pudo leer la estrategia.", savedId: null };
  }

  const parsed = strategySchema.safeParse(crudo);
  if (!parsed.success) {
    return { error: "La estrategia tiene campos inválidos.", savedId: null };
  }
  const costes = costsSchema.safeParse(costesCrudo);

  // La misma validación que la pantalla, para que no haya nada guardable que
  // no sea ejecutable.
  const problemas = validateStrategy(parsed.data as Strategy);
  if (problemas.length > 0) {
    return { error: problemas[0], savedId: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim() || null;

  const supabase = await createClient();
  // El `user_id` sólo va en el alta: en la modificación lo fija el `eq` de
  // abajo y la política de RLS, y mandarlo además sería ofrecer cambiarlo.
  const campos = {
    name: parsed.data.name,
    product_id: productId,
    rules: parsed.data as unknown as Json,
    costs: (costes.success ? costes.data : DEFAULT_COSTS) as unknown as Json,
  };

  const { data, error } = id
    ? await supabase
        .from("backtest_strategies")
        .update({ ...campos, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .single()
    : await supabase.from("backtest_strategies").insert({ user_id: user.id, ...campos }).select("id").single();

  if (error || !data) {
    // El único error que el usuario puede arreglar es el del nombre repetido,
    // así que se distingue en vez de decir «no se pudo guardar» a todo.
    const repetido = error?.code === "23505";
    return {
      error: repetido ? "Ya tienes una estrategia con ese nombre." : "No se pudo guardar.",
      savedId: null,
    };
  }

  revalidatePath("/backtest");
  return { error: null, savedId: data.id };
}

export async function deleteBacktestStrategy(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("backtest_strategies").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/backtest");
}
