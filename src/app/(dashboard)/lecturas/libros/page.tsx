import Link from "next/link";
import type { Route } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BOOK_STATUS_LABELS, bookProgress, formatReadingTime } from "@/modules/reading/domain/reading";
import { fetchBooks, fetchSessions } from "@/modules/reading/queries";
import { NewBookForm } from "@/modules/reading/ui/reading-forms";

/**
 * Lecturas: libros.
 *
 * El género vive aquí, en el libro, y no en cada sesión -- que es donde
 * estaba en Notion y por eso los campos acabaron cruzados. Un libro se lee a
 * lo largo de semanas y su género no cambia entre ratos.
 */
export default async function BooksPage() {
  const [books, sessions] = await Promise.all([fetchBooks(), fetchSessions(500)]);

  const minutesByBook = new Map<string, number>();
  for (const s of sessions) {
    if (!s.book_id) continue;
    minutesByBook.set(s.book_id, (minutesByBook.get(s.book_id) ?? 0) + (s.minutes ?? 0));
  }

  const reading = books.filter((b) => b.status === "LEYENDO");
  const finished = books.filter((b) => b.status === "TERMINADO");

  return (
    <>
      <PageHeader title="Libros" description="Lo que estás leyendo, lo que terminaste y lo que dejaste." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="Leyendo ahora" value={String(reading.length)} />
        <StatTile size="lg" label="Terminados" value={String(finished.length)} />
        <StatTile size="lg" label="En la lista" value={String(books.length)} sub="en total" />
        <StatTile
          size="lg"
          label="Páginas leídas"
          value={String(books.reduce((sum, b) => sum + b.pagesRead, 0))}
          sub="sumando todos"
        />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>Todos los libros</CardTitle>
            <CardDescription>El avance sale de las páginas que apuntas en cada sesión.</CardDescription>
          </div>
          <NewBookForm />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {books.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay libros. Puedes registrar lecturas sin libro, pero con libro salen el avance
              y el género.
            </p>
          ) : (
            books.map((book) => {
              const progress = bookProgress(book.pagesRead, book.total_pages);
              const minutes = minutesByBook.get(book.id) ?? 0;

              return (
                <div
                  key={book.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link
                      href={`/lecturas/libros/${book.id}` as Route}
                      className="font-medium hover:underline"
                    >
                      {book.icon ? `${book.icon} ` : ""}
                      {book.title}
                    </Link>
                    {book.author ? (
                      <span className="text-sm text-muted-foreground">{book.author}</span>
                    ) : null}
                    <Badge variant="outline" className="ml-auto">
                      {BOOK_STATUS_LABELS[book.status]}
                    </Badge>
                  </div>

                  {progress !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${progress}%`, backgroundColor: "var(--mod-reading)" }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {book.pagesRead}/{book.total_pages}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {book.pagesRead} páginas leídas
                      {book.total_pages ? "" : " · sin total, no hay barra de avance"}
                    </span>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {book.genres.map((g) => (
                      <span
                        key={g}
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {g}
                      </span>
                    ))}
                    {minutes > 0 ? (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatReadingTime(minutes)} leídos
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
