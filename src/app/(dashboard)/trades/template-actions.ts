"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { parseTemplateValues, type JournalTemplateRow } from "@/lib/journal/saved-templates";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Guardar y reutilizar una combinación de diario.
 *
 * Los errores se repiten: eso es lo que los hace errores. Una ráfaga de FOMO
 * tras una pérdida lleva siempre las mismas etiquetas, la misma emoción y casi
 * la misma nota, y volver a marcarlas una por una es la fricción que hace que
 * a la tercera ya no se apunte nada.
 */
const saveSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la plantilla.").max(80, "El nombre es largo."),
  values: z.record(z.string(), z.unknown()),
});

export async function saveJournalTemplate(
  name: string,
  values: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const parsed = saveSchema.safeParse({ name, values });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  // Lo que se guarda pasa por el mismo saneado que lo que se aplica: una
  // plantilla que guarda un campo que la aplicación no acepta sería una que
  // falla en silencio el día que se usa.
  const limpio = parseTemplateValues(parsed.data.values as Json);
  if (Object.keys(limpio).length === 0) {
    return { error: "No hay nada que guardar: marca al menos un campo." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("journal_templates").upsert(
    {
      user_id: user.id,
      name: parsed.data.name,
      values: limpio as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,name" },
  );

  if (error) return { error: "No se pudo guardar la plantilla." };

  revalidatePath("/trades");
  revalidatePath("/journal");
  return { error: null };
}

export async function listJournalTemplates(): Promise<JournalTemplateRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("journal_templates")
    .select("id, name, values, use_count")
    .eq("user_id", user.id)
    // Por uso y no por nombre: la que más usas es casi siempre la que buscas.
    .order("use_count", { ascending: false })
    .order("name")
    .limit(20);

  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    values: parseTemplateValues(t.values),
    useCount: t.use_count,
  }));
}

/** Se llama al aplicarla, para que el orden refleje lo que de verdad se usa. */
export async function markTemplateUsed(templateId: string): Promise<void> {
  if (!z.uuid().safeParse(templateId).success) return;

  const user = await requireUser();
  const supabase = await createClient();

  const { data: actual } = await supabase
    .from("journal_templates")
    .select("use_count")
    .eq("id", templateId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actual) return;

  await supabase
    .from("journal_templates")
    .update({ use_count: actual.use_count + 1, last_used_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("user_id", user.id);
}

export async function deleteJournalTemplate(templateId: string): Promise<{ error: string | null }> {
  if (!z.uuid().safeParse(templateId).success) return { error: "Plantilla inválida." };

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("journal_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo borrar la plantilla." };

  revalidatePath("/trades");
  revalidatePath("/journal");
  return { error: null };
}
