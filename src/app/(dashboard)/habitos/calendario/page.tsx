import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { ChartFrame } from "@/core/ui/chart-frame";
import { HeatGrid, LineSeries } from "@/core/ui/charts";
import { userTimezone } from "@/core/user-settings";
import { currentStreak, rateOver } from "@/modules/habits/domain/habits";
import { dailyCompletion } from "@/modules/habits/domain/habits-analysis";
import { fetchHabits } from "@/modules/habits/queries";

const WEEKS = 13;

/**
 * Hábitos: calendario.
 *
 * Una cuadrícula por hábito, al estilo de las contribuciones de GitHub, que
 * es la forma canónica de mirar una costumbre porque enseña lo único que
 * importa de ella: la continuidad. Una tabla de sí/no dice lo mismo y se lee
 * mucho peor.
 *
 * Arriba, la línea de cumplimiento diario junta todos los hábitos en una sola
 * cifra. Es donde se ven las malas semanas: un hábito suelto se cae sin que
 * pase nada, tres días seguidos al veinte por ciento son una semana perdida.
 */
export default async function HabitsCalendarPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const from = shiftDate(today, -(WEEKS * 7 - 1));

  const habits = await fetchHabits(today, WEEKS * 7);
  const active = habits.filter((h) => h.archivedAt === null);

  const completion = dailyCompletion(
    active.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji, dates: h.dates })),
    from,
    today,
  );

  return (
    <>
      <PageHeader
        title="Calendario de hábitos"
        description={`Las últimas ${WEEKS} semanas, hábito a hábito.`}
      />

      <ChartFrame
        title="Cumplimiento diario"
        question="Qué porcentaje de tus hábitos marcaste cada día."
        empty={completion.length === 0}
        emptyLabel="Añade algún hábito activo para ver esta línea."
      >
        <LineSeries data={completion} colorToken="--mod-habits" unit="%" height={220} />
      </ChartFrame>

      {active.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No tienes hábitos activos. Créalos en «Hoy» y aquí aparecerá su calendario.
          </CardContent>
        </Card>
      ) : (
        active.map((habit) => (
          <Card key={habit.id}>
            <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-3 space-y-0">
              <CardTitle className="text-base">
                {habit.emoji ? `${habit.emoji} ` : ""}
                {habit.name}
              </CardTitle>
              <CardDescription className="tabular-nums">
                {rateOver(habit.dates, from, today)}% · racha de{" "}
                {currentStreak(habit.dates, today)} días
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HeatGrid
                cells={habit.dates.map((date) => ({ date, value: 1 }))}
                colorToken="--mod-habits"
                today={today}
                weeks={WEEKS}
              />
            </CardContent>
          </Card>
        ))
      )}
    </>
  );
}
