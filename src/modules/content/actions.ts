"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, countPieces } from "@/modules/content/domain/content";

export type ContentFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

const schema = z.object({
  title: z.string().trim().min(1, "Ponle título a la pieza.").max(200),
  planned_date: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  notes: emptyToNull(z.string().max(4000)),
  // Sólo rutas absolutas http(s): un enlace es para pulsarlo, y aceptar
  // cualquier cadena acaba en enlaces rotos o peores.
  url: emptyToNull(z.string().url("El enlace no es válido.").max(500)),
});

export async function createPiece(
  _prev: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    title: formData.get("title"),
    planned_date: formData.get("planned_date"),
    notes: formData.get("notes"),
    url: formData.get("url"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("content_pieces").insert({
    user_id: user.id,
    title: parsed.data.title,
    planned_date: parsed.data.planned_date,
    notes: parsed.data.notes,
    url: parsed.data.url,
    platforms: formData.getAll("platforms").map(String),
  });
  if (error) return { error: "No se pudo guardar la pieza.", success: false };

  await republish();
  revalidatePath("/contenido");
  revalidatePath("/");
  return { error: null, success: true };
}

export async function setPieceStatus(pieceId: string, status: string): Promise<void> {
  const user = await requireUser();
  if (!(STATUSES as readonly string[]).includes(status)) return;

  const supabase = await createClient();
  await supabase
    .from("content_pieces")
    .update({
      status: status as (typeof STATUSES)[number],
      // Sellar la publicación permite contar cuántas salieron este mes, que
      // es la única pregunta que importa aquí.
      published_at: status === "PUBLICADO" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pieceId)
    .eq("user_id", user.id);

  await republish();
  revalidatePath("/contenido");
  revalidatePath("/");
}

export async function deletePiece(pieceId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("content_pieces").delete().eq("id", pieceId).eq("user_id", user.id);
  await republish();
  revalidatePath("/contenido");
  revalidatePath("/");
}

async function republish(): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  const today = todayIn(await userTimezone());

  const { data } = await supabase
    .from("content_pieces")
    .select("status, planned_date, published_at")
    .eq("user_id", user.id);

  const counts = countPieces(
    (data ?? []).map((p) => ({
      status: p.status,
      plannedDate: p.planned_date,
      publishedAt: p.published_at,
    })),
    today,
  );

  await publishDailyMetrics(today, [
    { module: "content", key: "en_cola", value: counts.inProgress },
    { module: "content", key: "atrasadas", value: counts.late },
  ]);
}
