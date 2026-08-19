"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { BOOK_STATUSES } from "@/modules/reading/domain/reading";

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

export async function logReadingSession(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const parsed = sessionSchema.safeParse({
    session_date: formData.get("session_date"),
    book_id: formData.get("book_id"),
    started_at: formData.get("started_at"),
    minutes: formData.get("minutes"),
    pages: formData.get("pages"),
    score: formData.get("score"),
    summary: formData.get("summary"),
  });
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
  revalidatePath("/lecturas");
  revalidatePath("/");
  return { error: null, success: true };
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
});

export async function createBook(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const parsed = bookSchema.safeParse({
    title: formData.get("title"),
    author: formData.get("author"),
    total_pages: formData.get("total_pages"),
    status: formData.get("status") || "LEYENDO",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reading_books").insert({
    user_id: user.id,
    title: parsed.data.title,
    author: parsed.data.author,
    total_pages: parsed.data.total_pages,
    status: parsed.data.status,
    genres: formData.getAll("genres").map(String),
  });

  if (error) {
    return {
      error: error.code === "23505" ? "Ya tienes un libro con ese título." : "No se pudo guardar el libro.",
      success: false,
    };
  }

  revalidatePath("/lecturas");
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

  revalidatePath("/lecturas");
}
