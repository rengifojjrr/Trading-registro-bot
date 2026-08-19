import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import {
  BOOK_STATUS_LABELS,
  bookProgress,
  formatReadingTime,
  totalsFor,
} from "@/modules/reading/domain/reading";
import { fetchBooks, fetchSessions } from "@/modules/reading/queries";
import { LogReadingForm, NewBookForm } from "@/modules/reading/ui/reading-forms";

/**
 * Lecturas.
 *
 * Las sesiones y los libros son cosas distintas: una sesión son minutos y
 * páginas de un día; un libro es el género, el autor y el avance. En Notion
 * estaban en la misma fila y por eso los campos acabaron cruzados.
 */
export default async function ReadingPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const [books, sessions] = await Promise.all([fetchBooks(), fetchSessions()]);

  const monthStart = shiftDate(today, -30);
  const lastMonth = totalsFor(
    sessions
      .filter((s) => s.session_date >= monthStart)
      .map((s) => ({ minutes: s.minutes, pages: s.pages, sessionDate: s.session_date })),
  );
  const todayTotals = totalsFor(
    sessions
      .filter((s) => s.session_date === today)
      .map((s) => ({ minutes: s.minutes, pages: s.pages, sessionDate: s.session_date })),
  );

  return (
    <>
      <PageHeader title="Lecturas" description="Cuánto lees de verdad, y qué te llevas de cada rato." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="Hoy" value={formatReadingTime(todayTotals.minutes)} sub={`${todayTotals.pages} páginas`} />
        <StatTile size="lg" label="Últimos 30 días" value={formatReadingTime(lastMonth.minutes)} sub={`${lastMonth.sessions} sesiones`} />
        <StatTile size="lg" label="Páginas del mes" value={String(lastMonth.pages)} />
        <StatTile
          size="lg"
          label="Ritmo"
          value={lastMonth.pagesPerHour === null ? "--" : `${lastMonth.pagesPerHour} pág/h`}
          description="Páginas por hora del último mes. No se calcula con menos de diez minutos registrados: saldría un número grande y falso."
        />
      </div>

      <LogReadingForm date={today} books={books} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>Libros</CardTitle>
            <CardDescription>El género va aquí, en el libro, no en cada sesión.</CardDescription>
          </div>
          <NewBookForm />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {books.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay libros. Puedes registrar lecturas sin libro, pero con libro salen el avance y el género.
            </p>
          ) : (
            books.map((book) => {
              const progress = bookProgress(book.pagesRead, book.total_pages);
              return (
                <div key={book.id} className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{book.title}</span>
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

                  {book.genres.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {book.genres.map((g) => (
                        <span key={g} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {g}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesiones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin lecturas registradas todavía.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className="tabular-nums text-muted-foreground">
                    {formatDate(`${s.session_date}T00:00:00Z`, timezone)}
                  </span>
                  {s.bookTitle ? <span className="font-medium">{s.bookTitle}</span> : null}
                  <span className="ml-auto tabular-nums" style={{ color: "var(--mod-reading)" }}>
                    {[s.minutes ? formatReadingTime(s.minutes) : null, s.pages ? `${s.pages} pág` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {s.summary ? <p className="text-sm text-foreground/90">{s.summary}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
