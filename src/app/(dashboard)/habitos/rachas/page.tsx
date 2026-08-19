import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { ChartFrame } from "@/core/ui/chart-frame";
import { BarSeries, RankSeries } from "@/core/ui/charts";
import { userTimezone } from "@/core/user-settings";
import { currentStreak, longestStreak, rateOver } from "@/modules/habits/domain/habits";
import { habitRanking, weekdayRates } from "@/modules/habits/domain/habits-analysis";
import { fetchHabits } from "@/modules/habits/queries";

const WINDOW_DAYS = 90;

/**
 * Hábitos: rachas.
 *
 * Tres preguntas: cuál llevas mejor, qué día de la semana se te cae todo, y
 * cuánto aguantas seguido.
 *
 * La del día de la semana es la que más cambia algo. Casi siempre hay una
 * forma -- el domingo, o el viernes por la noche -- y verla permite cambiar
 * el plan en lugar de insistir en el mismo y fallar en el mismo sitio.
 */
export default async function HabitsStreaksPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const from = shiftDate(today, -(WINDOW_DAYS - 1));

  const habits = await fetchHabits(today, WINDOW_DAYS);
  const active = habits.filter((h) => h.archivedAt === null);
  const histories = active.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji, dates: h.dates }));

  const ranking = habitRanking(histories, from, today);
  const weekdays = weekdayRates(histories, from, today);

  const streaks = active
    .map((h) => ({
      name: h.emoji ? `${h.emoji} ${h.name}` : h.name,
      current: currentStreak(h.dates, today),
      longest: longestStreak(h.dates),
      rate: rateOver(h.dates, from, today),
    }))
    .sort((a, b) => b.current - a.current || b.longest - a.longest);

  const bestCurrent = Math.max(0, ...streaks.map((s) => s.current));
  const bestEver = Math.max(0, ...streaks.map((s) => s.longest));
  const worstDay = [...weekdays].sort((a, b) => a.value - b.value)[0];

  return (
    <>
      <PageHeader title="Rachas" description={`Los últimos ${WINDOW_DAYS} días.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          size="lg"
          label="Racha en curso"
          value={bestCurrent === 0 ? "--" : `${bestCurrent} días`}
          sub="la más larga ahora mismo"
          description="No haber marcado todavía hoy no rompe la racha: a media mañana aún no has hecho lo de hoy, y enseñar un cero ahí castiga por la hora que es."
        />
        <StatTile
          size="lg"
          label="Tu récord"
          value={bestEver === 0 ? "--" : `${bestEver} días`}
          sub="de cualquier hábito"
        />
        <StatTile
          size="lg"
          label="Tu peor día"
          value={active.length === 0 || !worstDay ? "--" : worstDay.label}
          sub={worstDay ? `${worstDay.value}% de cumplimiento` : ""}
        />
      </div>

      <ChartFrame
        title="Qué hábito llevas mejor"
        question={`Porcentaje de días cumplidos en los últimos ${WINDOW_DAYS}.`}
        empty={ranking.length === 0}
        emptyLabel="Añade algún hábito activo para comparar."
      >
        <RankSeries
          data={ranking}
          colorToken="--mod-habits"
          unit="%"
          height={Math.max(160, ranking.length * 32 + 40)}
        />
      </ChartFrame>

      <ChartFrame
        title="En qué día de la semana se te cae"
        question="Cumplimiento medio de todos tus hábitos, por día."
        hint={`El denominador son los días de esa semana que ha habido en la ventana, no los ${WINDOW_DAYS} días: si ha habido trece lunes y marcaste diez, es un 77 %.`}
        empty={active.length === 0}
        emptyLabel="Hace falta al menos un hábito activo."
      >
        <BarSeries data={weekdays} colorToken="--mod-habits" unit="%" height={220} />
      </ChartFrame>

      <Card>
        <CardContent className="pt-6">
          {streaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tienes hábitos activos. Créalos en «Hoy» y aquí verás sus rachas.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {streaks.map((s) => (
                <li key={s.name} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
                  <span className="text-sm font-medium text-foreground">{s.name}</span>
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {s.current} en curso · récord {s.longest} · {s.rate}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
