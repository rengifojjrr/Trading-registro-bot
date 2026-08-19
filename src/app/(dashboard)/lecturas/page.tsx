import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { formatReadingTime, totalsFor } from "@/modules/reading/domain/reading";
import { fetchBooks, fetchSessions } from "@/modules/reading/queries";
import { LogReadingForm } from "@/modules/reading/ui/reading-forms";

/**
 * Lecturas: registrar.
 *
 * Igual que en sueño, lo primero que se ve es el formulario: es lo que se
 * abre a diario. Los libros y el análisis tienen su propia sección para que
 * esta no crezca hasta dejar de servir para lo único que se le pide.
 */
export default async function ReadingPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const [books, sessions] = await Promise.all([fetchBooks(), fetchSessions(20)]);

  const monthStart = shiftDate(today, -30);
  const asTotals = (rows: typeof sessions) =>
    totalsFor(rows.map((s) => ({ minutes: s.minutes, pages: s.pages, sessionDate: s.session_date })));

  const lastMonth = asTotals(sessions.filter((s) => s.session_date >= monthStart));
  const todayTotals = asTotals(sessions.filter((s) => s.session_date === today));

  return (
    <>
      <PageHeader title="Registrar lectura" description="Minutos, páginas y qué te llevaste del rato." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          size="lg"
          label="Hoy"
          value={formatReadingTime(todayTotals.minutes)}
          sub={`${todayTotals.pages} páginas`}
        />
        <StatTile
          size="lg"
          label="Últimos 30 días"
          value={formatReadingTime(lastMonth.minutes)}
          sub={`${lastMonth.sessions} sesiones`}
        />
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
        <CardHeader>
          <CardTitle className="text-base">Últimas sesiones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin lecturas registradas todavía.</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0 last:pb-0"
              >
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

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <Link href="/lecturas/libros" className="underline underline-offset-4 hover:text-foreground">
          Ver los libros
        </Link>
        <Link href="/lecturas/analisis" className="underline underline-offset-4 hover:text-foreground">
          Ver el análisis
        </Link>
      </div>
    </>
  );
}
