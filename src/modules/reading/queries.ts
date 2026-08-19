import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { BookStatus } from "@/modules/reading/domain/reading";

export interface BookRow {
  id: string;
  title: string;
  author: string | null;
  genres: string[];
  total_pages: number | null;
  status: BookStatus;
  /** Páginas acumuladas de todas las sesiones de ese libro. */
  pagesRead: number;
}

export interface SessionRow {
  id: string;
  book_id: string | null;
  bookTitle: string | null;
  /**
   * Los géneros del libro de esa sesión. Viajan con la sesión porque el
   * análisis reparte minutos por género y el género vive en el libro: sin
   * esto haría falta una segunda consulta por cada gráfica.
   */
  bookGenres: string[];
  session_date: string;
  started_at: string | null;
  minutes: number | null;
  pages: number | null;
  score: number | null;
  summary: string | null;
}

export async function fetchBooks(): Promise<BookRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: books }, { data: sessions }] = await Promise.all([
    supabase
      .from("reading_books")
      .select("id, title, author, genres, total_pages, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("reading_sessions").select("book_id, pages").eq("user_id", user.id),
  ]);

  const pagesByBook = new Map<string, number>();
  for (const s of sessions ?? []) {
    if (!s.book_id) continue;
    pagesByBook.set(s.book_id, (pagesByBook.get(s.book_id) ?? 0) + (s.pages ?? 0));
  }

  return (books ?? []).map((b) => ({ ...b, pagesRead: pagesByBook.get(b.id) ?? 0 }));
}

export async function fetchSessions(limit = 60): Promise<SessionRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reading_sessions")
    .select("id, book_id, session_date, started_at, minutes, pages, score, summary")
    .eq("user_id", user.id)
    .order("session_date", { ascending: false })
    .limit(limit);

  const rows = data ?? [];
  const bookIds = [...new Set(rows.map((r) => r.book_id).filter((id): id is string => id !== null))];

  const { data: books } =
    bookIds.length > 0
      ? await supabase.from("reading_books").select("id, title, genres").in("id", bookIds)
      : { data: [] };

  const bookById = new Map((books ?? []).map((b) => [b.id, b]));

  return rows.map((r) => {
    const book = r.book_id ? bookById.get(r.book_id) : undefined;
    return {
      ...r,
      score: r.score === null ? null : Number(r.score),
      bookTitle: book?.title ?? null,
      bookGenres: book?.genres ?? [],
    };
  });
}
