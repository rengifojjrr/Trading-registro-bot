import "server-only";

import { DateTime } from "luxon";

import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { EMPTY_RESULT, readNotionDatabase, type ImportResult } from "@/lib/notion/read-database";
import { createClient } from "@/lib/supabase/server";

import { booksIn, mapNotionSession, type NotionMappedSession } from "./domain/notion-mapping";

/**
 * Trae las lecturas de la base «Leer».
 *
 * Es la importación que más deshace: allí los campos están cruzados -- «Cuanto
 * Tiempo lei ?» guarda géneros y «Cuantas Hojas» guarda minutos -- así que
 * cada uno se lee por lo que contiene y no por cómo se llama.
 *
 * Y hay algo que no se puede recuperar: **las páginas leídas no existen**,
 * porque su campo quedó ocupado por los minutos. Se importan como ausentes en
 * lugar de inventarse un número, y la importación lo dice en voz alta.
 */

export function readingDatabaseId(): string | null {
  return serverEnv().NOTION_READING_DATABASE_ID ?? null;
}

export async function importReadingFromNotion(): Promise<ImportResult> {
  const env = serverEnv();
  if (!env.NOTION_API_TOKEN) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_API_TOKEN en el servidor." };
  }
  if (!env.NOTION_READING_DATABASE_ID) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_READING_DATABASE_ID en el servidor." };
  }

  const user = await requireUser();
  const timezone = await userTimezone();
  const supabase = await createClient();

  const read = await readNotionDatabase(env.NOTION_READING_DATABASE_ID);
  if (!read.ok) return { ...EMPTY_RESULT, error: read.error };

  const warnings = new Set<string>();
  const sessions: NotionMappedSession[] = [];
  let skipped = 0;

  for (const page of read.pages) {
    const mapped = mapNotionSession(page);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    for (const warning of mapped.warnings) warnings.add(warning);
    sessions.push(mapped.session);
  }

  if (sessions.length === 0) {
    return { ...EMPTY_RESULT, skipped, warnings: [...warnings] };
  }

  // Los libros salen de las lecturas: en Notion no hay una base de libros
  // usable -- la que existe sólo tiene dos filas de prueba.
  const { data: current } = await supabase
    .from("reading_books")
    .select("id, title")
    .eq("user_id", user.id);

  const idByTitle = new Map((current ?? []).map((b) => [b.title, b.id]));
  const books = booksIn(sessions);
  const missing = books.filter((book) => !idByTitle.has(book.title));

  if (missing.length > 0) {
    const { data: created, error } = await supabase
      .from("reading_books")
      .insert(
        missing.map((book) => ({
          user_id: user.id,
          title: book.title,
          author: book.author,
          genres: book.genres,
          status: "LEYENDO" as const,
        })),
      )
      .select("id, title");
    if (error) return { ...EMPTY_RESULT, error: "No se pudieron crear los libros." };
    for (const book of created ?? []) idByTitle.set(book.title, book.id);
  }

  const rows = sessions.map((session) => ({
    user_id: user.id,
    notion_page_id: session.notion_page_id,
    book_id: session.book_title ? (idByTitle.get(session.book_title) ?? null) : null,
    session_date: session.session_date,
    started_at: session.start_clock
      ? (DateTime.fromISO(`${session.session_date}T${session.start_clock}`, { zone: timezone }).toISO() ??
        null)
      : null,
    minutes: session.minutes,
    pages: session.pages,
    score: session.score,
    summary: session.summary,
  }));

  const { data: existing } = await supabase
    .from("reading_sessions")
    .select("notion_page_id")
    .eq("user_id", user.id)
    .not("notion_page_id", "is", null);
  const known = new Set((existing ?? []).map((row) => row.notion_page_id));

  const { error } = await supabase
    .from("reading_sessions")
    .upsert(rows, { onConflict: "user_id,notion_page_id" });
  if (error) {
    return { ...EMPTY_RESULT, error: "No se pudieron guardar las lecturas importadas." };
  }

  const updated = rows.filter((row) => known.has(row.notion_page_id)).length;

  const notes = [
    "Las páginas leídas no vienen: en Notion su campo («Cuantas Hojas») quedó ocupado por los minutos, así que no existen en ningún sitio. El ritmo de páginas por hora empezará a salir con lo que registres desde ahora.",
  ];
  if (missing.length > 0) notes.push(`Libros creados: ${missing.map((b) => b.title).join(", ")}.`);

  return {
    imported: rows.length - updated,
    updated,
    skipped,
    warnings: [...warnings],
    notes,
    error: null,
  };
}
