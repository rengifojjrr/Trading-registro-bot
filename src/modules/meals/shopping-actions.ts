"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { normaliseName } from "@/modules/meals/domain/shopping";
import { createClient } from "@/lib/supabase/server";

/**
 * Marcar lo comprado y añadir lo que no viene de ninguna comida.
 *
 * Las dos escrituras son idempotentes por diseño --marcar dos veces lo mismo
 * deja el mismo estado-- porque son justamente el tipo de cosa que se apunta
 * en el súper, donde la cobertura va y viene, y la cola sin conexión las
 * reintenta.
 */

export async function toggleShoppingItem(name: string, comprado: boolean): Promise<void> {
  const user = await requireUser();
  const clave = normaliseName(name);
  if (clave === "") return;

  const supabase = await createClient();

  if (comprado) {
    // `upsert` y no `insert`: marcar dos veces lo mismo --dos toques, o un
    // reintento de la cola sin conexión-- no puede fallar.
    await supabase
      .from("shopping_checked")
      .upsert({ user_id: user.id, item_key: clave }, { onConflict: "user_id,item_key" });
  } else {
    await supabase
      .from("shopping_checked")
      .delete()
      .eq("user_id", user.id)
      .eq("item_key", clave);
  }

  revalidatePath("/comidas/compra");
}

const extraSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive().max(100000).nullable(),
  unit: z.string().trim().max(20).nullable(),
});

export async function addShoppingExtra(formData: FormData): Promise<void> {
  const user = await requireUser();

  const cantidad = String(formData.get("quantity") ?? "").trim();
  const parsed = extraSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    quantity: cantidad === "" ? null : Number(cantidad),
    unit: String(formData.get("unit") ?? "").trim() || null,
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase.from("shopping_extras").insert({
    user_id: user.id,
    name: parsed.data.name,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
  });

  revalidatePath("/comidas/compra");
}

export async function removeShoppingExtra(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("shopping_extras").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/comidas/compra");
}

/**
 * Vacía lo marcado, para empezar una compra nueva.
 *
 * Hace falta porque lo marcado se guarda por nombre y no por lista: sin esto,
 * los tomates de la semana pasada seguirían tachados en la de esta.
 */
export async function clearShoppingChecked(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("shopping_checked").delete().eq("user_id", user.id);
  revalidatePath("/comidas/compra");
}
