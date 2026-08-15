"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Ponle un nombre a la etiqueta.")
  .max(60, "El nombre es demasiado largo.");

export type TagFormState = { error: string | null; success: boolean };

export async function createTag(_prevState: TagFormState, formData: FormData): Promise<TagFormState> {
  const user = await requireUser();

  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nombre inválido.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tags").insert({ user_id: user.id, name: parsed.data });

  if (error) {
    // 23505 = unique_violation; tags are unique per (user_id, name).
    if (error.code === "23505") return { error: "Ya tienes una etiqueta con ese nombre.", success: false };
    return { error: "No se pudo crear la etiqueta.", success: false };
  }

  await recordAudit({ userId: user.id, action: "TAG_CREATED", entityType: "tag" });

  revalidatePath("/journal");
  return { error: null, success: true };
}

export async function renameTag(_prevState: TagFormState, formData: FormData): Promise<TagFormState> {
  const user = await requireUser();

  const id = formData.get("id");
  const parsedId = z.uuid().safeParse(id);
  const parsedName = nameSchema.safeParse(formData.get("name"));

  if (!parsedId.success) return { error: "Etiqueta inválida.", success: false };
  if (!parsedName.success) {
    return { error: parsedName.error.issues[0]?.message ?? "Nombre inválido.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .update({ name: parsedName.data })
    .eq("id", parsedId.data)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") return { error: "Ya tienes una etiqueta con ese nombre.", success: false };
    return { error: "No se pudo renombrar la etiqueta.", success: false };
  }

  // Renaming keeps the same row, so every trade that carries this tag
  // follows the new name -- no history is rewritten or detached.
  await recordAudit({ userId: user.id, action: "TAG_RENAMED", entityType: "tag" });

  revalidatePath("/journal");
  return { error: null, success: true };
}

/**
 * Deletes a tag. trade_tags cascades on delete, so this also removes the
 * tag from every trade that carried it -- the caller shows the usage count
 * first so that's a decision, not a surprise.
 */
export async function deleteTag(tagId: string): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(tagId).success) return { error: "Etiqueta inválida." };

  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("id", tagId).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar la etiqueta." };

  await recordAudit({ userId: user.id, action: "TAG_DELETED", entityType: "tag" });

  revalidatePath("/journal");
  return { error: null };
}
