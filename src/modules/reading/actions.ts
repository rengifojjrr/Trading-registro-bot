"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { BOOK_STATUSES } from "@/modules/reading/domain/reading";
import type { ImportResult } from "@/lib/notion/read-database";
import { importReadingFromNotion } from "@/modules/reading/notion-import";

export type ReadingFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

const sessionSchema = z.object({
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  book_id: emptyToNull(z.string().uuid()),
  started_at: emptyToNull(z.string()),
  minutes: emptyToNull(z.coerce.number().int().min(0).max(1440)),
  pages: emptyToNull(z.coerce.number().int().min(0).max(5000)),
  score: emptyToNull(z.coerce.number().min(0).max(10)),
  summary: emptyToNull(z.string().max(8000)),
});

function readSessionForm(formData: FormData) {
  return sessionSchema.safeParse({
    session_date: formData.get("session_date"),
    book_id: formData.get("book_id"),
    started_at: formData.get("started_at"),
    minutes: formData.get("minutes"),
    pages: formData.get("pages"),
    score: formData.get("score"),
    summary: formData.get("summary"),
  });
}

export async function logReadingSession(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const parsed = readSessionForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  if (parsed.data.minutes === null && parsed.data.pages === null) {
    return { error: "Apunta al menos los minutos o las páginas.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reading_sessions").insert({
    user_id: user.id,
    book_id: parsed.data.book_id,
    session_date: parsed.data.session_date,
    started_at: parsed.data.started_at,
    minutes: parsed.data.minutes,
    pages: parsed.data.pages,
    score: parsed.data.score,
    summary: parsed.data.summary,
  });
  if (error) return { error: "No se pudo guardar la lectura.", success: false };

  await republishDay(parsed.data.session_date);
  revalidateReading();
  return { error: null, success: true };
}

/**
 * Edita una sesión de lectura.
 *
 * No existía: registrar sólo creaba, así que unos minutos mal contados no se
 * arreglaban de ninguna forma.
 *
 * Se recuentan los dos días -- el de antes y el de después -- porque mover
 * una sesión de fecha cambia el total de ambos, y recontar sólo el nuevo
 * dejaría el viejo inflado para siempre.
 */
export async function updateReadingSession(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Lectura no encontrada.", success: false };
  }

  const parsed = readSessionForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  if (parsed.data.minutes === null && parsed.data.pages === null) {
    return { error: "Apunta al menos los minutos o las páginas.", success: false };
  }

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("reading_sessions")
    .select("session_date")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("reading_sessions")
    .update({
      book_id: parsed.data.book_id,
      session_date: parsed.data.session_date,
      started_at: parsed.data.started_at,
      minutes: parsed.data.minutes,
      pages: parsed.data.pages,
      score: parsed.data.score,
      summary: parsed.data.summary,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo guardar la lectura.", success: false };

  await republishDay(parsed.data.session_date);
  if (before && before.session_date !== parsed.data.session_date) {
    await republishDay(before.session_date);
  }

  revalidateReading();
  revalidatePath(`/lecturas/${id}`);
  return { error: null, success: true };
}

/** Rehace la cuenta del día cuando la papelera se lleva una sesión. */
export async function afterSessionRemoved(date: string): Promise<void> {
  await requireUser();
  await republishDay(date);
  revalidateReading();
}

/**
 * Vuelve a sumar el día entero desde la base.
 *
 * Puede haber varias sesiones el mismo día -- veinte minutos por la mañana y
 * cuarenta por la noche -- así que la métrica es la suma, no la última.
 */
async function republishDay(date: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reading_sessions")
    .select("minutes, pages")
    .eq("user_id", user.id)
    .eq("session_date", date);

  const minutes = (data ?? []).reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const pages = (data ?? []).reduce((sum, s) => sum + (s.pages ?? 0), 0);

  await publishDailyMetrics(date, [
    { module: "reading", key: "minutos", value: minutes, unit: "min" },
    { module: "reading", key: "paginas", value: pages },
  ]);
}

const bookSchema = z.object({
  title: z.string().trim().min(1, "Ponle título al libro.").max(200),
  author: emptyToNull(z.string().max(120)),
  total_pages: emptyToNull(z.coerce.number().int().positive().max(50000)),
  status: z.enum(BOOK_STATUSES).default("LEYENDO"),
  icon: emptyToNull(z.string().max(8)),
});

function readBookForm(formData: FormData) {
  return bookSchema.safeParse({
    title: formData.get("title"),
    author: formData.get("author"),
    total_pages: formData.get("total_pages"),
    status: formData.get("status") || "LEYENDO",
    icon: formData.get("icon"),
  });
}

export async function createBook(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const parsed = readBookForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reading_books").insert({
    user_id: user.id,
    ...parsed.data,
    genres: formData.getAll("genres").map(String),
  });

  if (error) {
    return {
      error: error.code === "23505" ? "Ya tienes un libro con ese título." : "No se pudo guardar el libro.",
      success: false,
    };
  }

  revalidateReading();
  return { error: null, success: true };
}

/** Edita un libro entero. */
export async function updateBook(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Libro no encontrado.", success: false };
  }

  const parsed = readBookForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reading_books")
    .update({ ...parsed.data, genres: formData.getAll("genres").map(String) })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return {
      error:
        error.code === "23505" ? "Ya tienes un libro con ese título." : "No se pudo guardar el libro.",
      success: false,
    };
  }

  revalidateReading();
  revalidatePath(`/lecturas/libros/${id}`);
  return { error: null, success: true };
}

export async function setBookStatus(bookId: string, status: string): Promise<void> {
  const user = await requireUser();
  if (!(BOOK_STATUSES as readonly string[]).includes(status)) return;

  const supabase = await createClient();
  await supabase
    .from("reading_books")
    .update({ status: status as (typeof BOOK_STATUSES)[number] })
    .eq("id", bookId)
    .eq("user_id", user.id);

  revalidateReading();
}

/** Las pantallas de Lecturas miran los mismos datos, así que caducan a la vez. */
function revalidateReading(): void {
  revalidatePath("/lecturas");
  revalidatePath("/lecturas/libros");
  revalidatePath("/lecturas/analisis");
  revalidatePath("/");
}

/**
 * Trae los datos desde Notion.
 *
 * Se dispara a mano y no por cron: la importación es de sentido único y pisa
 * lo que haya, así que una automática que cambie algo mientras se está
 * mirando la pantalla hace que la aplicación parezca embrujada.
 */
export async function runReadingFromNotion(): Promise<ImportResult> {
  await requireUser();
  const result = await importReadingFromNotion();
  if (result.error === null) revalidateReading();
  return result;
}
