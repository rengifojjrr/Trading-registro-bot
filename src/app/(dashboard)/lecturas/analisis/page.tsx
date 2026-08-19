import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { shiftDate, todayIn } from "@/core/today";
import { ChartFrame } from "@/core/ui/chart-frame";
import { BarSeries, RankSeries } from "@/core/ui/charts";
import { userTimezone } from "@/core/user-settings";
import { formatReadingTime } from "@/modules/reading/domain/reading";
import {
  minutesByBook,
  minutesByDay,
  minutesByGenre,
  minutesByTimeOfDay,
  overallPace,
  type AnalysableSession,
} from "@/modules/reading/domain/reading-analysis";
import { fetchSessions } from "@/modules/reading/queries";

const WINDOW_DAYS = 60;

/**
 * Lecturas: análisis.
 *
 * Cuatro preguntas: cuánto lees cada día, de qué lees, a qué hora, y en qué
 * libro se te va el tiempo.
 *
 * La de la hora es la única que puede cambiar algo: casi todo el mundo cree
 * que lee por la noche y resulta que sus ratos largos están en otro sitio.
 */
export default async function ReadingAnalysisPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const from = shiftDate(today, -(WINDOW_DAYS - 1));

  const rows = await fetchSessions(500);
  const sessions: AnalysableSession[] = rows
    .filter((r) => r.session_date >= from && r.session_date <= today)
    .map((r) => ({
      sessionDate: r.session_date,
      startedAt: r.started_at,
      minutes: r.minutes,
      pages: r.pages,
      bookTitle: r.bookTitle,
      bookGenres: r.bookGenres,
    }));

  const daily = minutesByDay(sessions, from, today);
  const genres = minutesByGenre(sessions);
  const byHour = minutesByTimeOfDay(sessions, timezone);
  const byBook = minutesByBook(sessions);

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const totalPages = sessions.reduce((sum, s) => sum + (s.pages ?? 0), 0);
  const daysRead = new Set(sessions.filter((s) => (s.minutes ?? 0) > 0).map((s) => s.sessionDate)).size;
  const pace = overallPace(sessions);
  const averageMinutes = daily.length === 0 ? null : Math.round(totalMinutes / daily.length);

  return (
    <>
      <PageHeader title="Análisis de lecturas" description={`Los últimos ${WINDOW_DAYS} días.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="Tiempo leído" value={formatReadingTime(totalMinutes)} />
        <StatTile size="lg" label="Páginas" value={String(totalPages)} />
        <StatTile
          size="lg"
          label="Días con lectura"
          value={`${daysRead} de ${daily.length}`}
          sub={daily.length === 0 ? "" : `${Math.round((daysRead / daily.length) * 100)}%`}
        />
        <StatTile
          size="lg"
          label="Ritmo"
          value={pace === null ? "--" : `${pace} pág/h`}
          description="Se calcula sobre el total, no promediando el ritmo de cada sesión: promediar da el mismo peso a un rato de cinco minutos que a uno de dos horas, y los cortos son los que dan ritmos disparatados."
        />
      </div>

      <ChartFrame
        title="Cuánto leíste cada día"
        question="En minutos. Los días a cero son días sin leer, y son los que hay que mirar."
        empty={daily.length === 0}
        emptyLabel="Registra alguna lectura y esta gráfica aparece."
      >
        <BarSeries
          data={daily}
          colorToken="--mod-reading"
          average={averageMinutes}
          unit="min"
          height={240}
        />
      </ChartFrame>

      <ChartFrame
        title="De qué lees"
        question="Minutos por género."
        hint="El género es del libro, así que una sesión de un libro con dos géneros suma sus minutos a los dos. Por eso la suma de la gráfica puede pasar del tiempo total: la pregunta es de qué lees, no cómo repartes las horas."
        empty={genres.length === 0}
        emptyLabel="Pon géneros a tus libros y este reparto aparece solo."
      >
        <RankSeries
          data={genres}
          colorToken="--mod-reading"
          unit="min"
          height={Math.max(160, genres.length * 34 + 40)}
        />
      </ChartFrame>

      <ChartFrame
        title="A qué hora lees"
        question="Minutos por franja de dos horas."
        hint="Sólo cuentan las sesiones en las que apuntaste la hora de inicio. Meter las demás en una franja inventada movería el resultado entero."
        empty={byHour.length === 0}
        emptyLabel="Apunta la hora a la que empiezas a leer y aquí sale tu costumbre."
      >
        <BarSeries data={byHour} colorToken="--mod-reading" unit="min" height={220} />
      </ChartFrame>

      <ChartFrame
        title="En qué libro se te va el tiempo"
        question="Minutos por libro en la ventana."
        empty={byBook.length === 0}
        emptyLabel="Asocia tus lecturas a un libro para ver este reparto."
      >
        <RankSeries
          data={byBook.slice(0, 12)}
          colorToken="--mod-reading"
          unit="min"
          height={Math.max(160, Math.min(12, byBook.length) * 34 + 40)}
        />
      </ChartFrame>
    </>
  );
}
