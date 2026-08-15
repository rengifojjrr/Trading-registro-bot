"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * A saved view is a named filter combination for one page.
 *
 * The filters already live in the URL, so the whole thing is a path plus a
 * query string -- which means a filter added later is saved correctly
 * without any change here.
 */
const saveSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la vista.").max(60, "Máximo 60 caracteres."),
  // Only an app-internal path: this value is used to navigate, so anything
  // that could point off-site (or to a protocol-relative "//host") is
  // rejected rather than sanitised.
  path: z.string().regex(/^\/(?!\/)[\w\-/]*$/, "Ruta no válida."),
  query: z.string().max(2000).default(""),
});

export type SavedViewState = { error: string | null; success: boolean };

export async function saveView(
  _prevState: SavedViewState,
  formData: FormData,
): Promise<SavedViewState> {
  const user = await requireUser();

  const parsed = saveSchema.safeParse({
    name: formData.get("name"),
    path: formData.get("path"),
    query: formData.get("query") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("saved_views").insert({
    user_id: user.id,
    name: parsed.data.name,
    path: parsed.data.path,
    query: parsed.data.query.replace(/^\?/, ""),
  });

  if (error) {
    // The unique constraint is the expected failure here, and "you already
    // have one with that name" is more useful than the raw message.
    return {
      error: error.code === "23505" ? "Ya tienes una vista con ese nombre en esta página." : "No se pudo guardar la vista.",
      success: false,
    };
  }

  revalidatePath(parsed.data.path);
  return { error: null, success: true };
}

export async function deleteView(id: string, path: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("saved_views").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath(path);
}
