"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  CONTENT_TYPES,
  DIFFICULTIES,
  EDIT_TIME_OPTIONS,
  RECORD_TIME_OPTIONS,
  STATUSES,
  countPieces,
} from "@/modules/content/domain/content";

export type ContentFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

const schema = z.object({
  title: z.string().trim().min(1, "Ponle título a la pieza.").max(200),
  summary: emptyToNull(z.string().max(2000)),
  status: z.enum(STATUSES).default("IDEA"),
  content_type: emptyToNull(z.enum(CONTENT_TYPES)),
  planned_date: emptyToNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  record_difficulty: emptyToNull(z.enum(DIFFICULTIES)),
  // Las etiquetas de tiempo llegan tal cual del desplegable y se traducen a
  // minutos aquí, para que el formulario siga hablando el idioma de Notion.
  record_time: emptyToNull(z.string().max(80)),
  edit_time: emptyToNull(z.string().max(80)),
  edit_notes: emptyToNull(z.string().max(4000)),
  notes: emptyToNull(z.string().max(4000)),
  // Sólo rutas absolutas http(s): un enlace es para pulsarlo, y aceptar
  // cualquier cadena acaba en enlaces rotos o peores.
  url: emptyToNull(z.string().url("El enlace no es válido.").max(500)),
  video_url: emptyToNull(z.string().url("El enlace del vídeo no es válido.").max(500)),
  final_url: emptyToNull(z.string().url("El enlace final no es válido.").max(500)),
});

function readForm(formData: FormData) {
  return schema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    status: formData.get("status") || "IDEA",
    content_type: formData.get("content_type"),
    planned_date: formData.get("planned_date"),
    record_difficulty: formData.get("record_difficulty"),
    record_time: formData.get("record_time"),
    edit_time: formData.get("edit_time"),
    edit_notes: formData.get("edit_notes"),
    notes: formData.get("notes"),
    url: formData.get("url"),
    video_url: formData.get("video_url"),
    final_url: formData.get("final_url"),
  });
}

/**
 * Traduce la etiqueta elegida a minutos.
 *
 * Una etiqueta desconocida da null en lugar de cero: cero minutos de edición
 * es una afirmación, y «no sé» no lo es.
 */
function minutesFor(label: string | null, options: typeof RECORD_TIME_OPTIONS) {
  if (!label) return { minutes: null, uncapped: false };
  const option = options.find((o) => o.label === label);
  return { minutes: option?.minutes ?? null, uncapped: option?.uncapped ?? false };
}

function fieldsFrom(parsed: z.infer<typeof schema>, formData: FormData) {
  const record = minutesFor(parsed.record_time, RECORD_TIME_OPTIONS);
  const edit = minutesFor(parsed.edit_time, EDIT_TIME_OPTIONS);

  return {
    title: parsed.title,
    summary: parsed.summary,
    status: parsed.status,
    content_type: parsed.content_type,
    planned_date: parsed.planned_date,
    channels: formData.getAll("channels").map(String),
    platforms: formData.getAll("platforms").map(String),
    edit_styles: formData.getAll("edit_styles").map(String),
    // Una casilla sin marcar no viaja en el formulario, así que su ausencia
    // es el «no».
    has_script: formData.get("has_script") !== null,
    is_edited: formData.get("is_edited") !== null,
    has_thumbnail_ab: formData.get("has_thumbnail_ab") !== null,
    record_difficulty: parsed.record_difficulty,
    record_minutes: record.minutes,
    edit_minutes: edit.minutes,
    edit_time_uncapped: edit.uncapped,
    edit_notes: parsed.edit_notes,
    notes: parsed.notes,
    url: parsed.url,
    video_url: parsed.video_url,
    final_url: parsed.final_url,
  };
}

export async function createPiece(
  _prev: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const user = await requireUser();

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("content_pieces")
    .insert({ user_id: user.id, ...fieldsFrom(parsed.data, formData) });
  if (error) return { error: "No se pudo guardar la pieza.", success: false };

  await republish();
  revalidateContent();
  return { error: null, success: true };
}

export async function updatePiece(
  _prev: ContentFormState,
  formData: FormData,
): Promise<ContentFormState> {
  const user = await requireUser();

  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Pieza no encontrada.", success: false };

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("content_pieces")
    .update({ ...fieldsFrom(parsed.data, formData), updated_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar la pieza.", success: false };

  await republish();
  revalidateContent();
  return { error: null, success: true };
}

export async function setPieceStatus(pieceId: string, status: string): Promise<void> {
  const user = await requireUser();
  if (!(STATUSES as readonly string[]).includes(status)) return;

  const supabase = await createClient();

  // Sólo se sella la publicación la primera vez. Mover una pieza publicada a
  // otro estado y devolverla no debería reescribir la fecha en que salió.
  const { data: current } = await supabase
    .from("content_pieces")
    .select("published_at")
    .eq("id", pieceId)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase
    .from("content_pieces")
    .update({
      status: status as (typeof STATUSES)[number],
      published_at:
        status === "PUBLICADO" ? (current?.published_at ?? new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pieceId)
    .eq("user_id", user.id);

  await republish();
  revalidateContent();
}

/**
 * Lo único que el editor puede cambiar.
 *
 * Deliberadamente estrecho: el estado y las notas de edición, que son las dos
 * cosas que aparecen en su tablero de Notion. Dejarle el formulario entero
 * sería darle permiso para cambiar la fecha de publicación o el canal, que no
 * son suyos.
 */
export async function updateEditorFields(
  pieceId: string,
  status: string,
  editNotes: string,
): Promise<void> {
  const user = await requireUser();
  if (!(STATUSES as readonly string[]).includes(status)) return;

  const notes = z.string().max(4000).safeParse(editNotes);
  if (!notes.success) return;

  const supabase = await createClient();
  await supabase
    .from("content_pieces")
    .update({
      status: status as (typeof STATUSES)[number],
      edit_notes: notes.data.trim() === "" ? null : notes.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pieceId)
    .eq("user_id", user.id);

  await republish();
  revalidateContent();
}

export async function deletePiece(pieceId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("content_pieces").delete().eq("id", pieceId).eq("user_id", user.id);
  await republish();
  revalidateContent();
}

/** Las cinco pantallas del módulo miran las mismas piezas. */
function revalidateContent(): void {
  revalidatePath("/contenido");
  revalidatePath("/contenido/ideas");
  revalidatePath("/contenido/calendario");
  revalidatePath("/contenido/edicion");
  revalidatePath("/contenido/analisis");
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
