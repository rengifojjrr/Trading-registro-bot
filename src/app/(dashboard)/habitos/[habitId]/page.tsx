import { notFound } from "next/navigation";

import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEntityExtras } from "@/core/entity-extras";
import { shiftDate, todayIn } from "@/core/today";
import { DetailShell } from "@/core/ui/detail-shell";
import { userTimezone } from "@/core/user-settings";
import { currentStreak, longestStreak, rateOver } from "@/modules/habits/domain/habits";
import { fetchHabit } from "@/modules/habits/queries";
import { HabitMonths } from "@/modules/habits/ui/habit-months";

/**
 * La ficha de un hábito.
 *
 * Los doce meses de un vistazo, que es la única forma de ver de qué va un
 * hábito: la racha dice cómo va ahora y el porcentaje dice la media, pero
 * ninguno de los dos enseña que lo dejaste tres semanas en septiembre.
 *
 * Los días se pueden marcar desde aquí, así que rellenar un hueco viejo es
 * pulsar el cuadro en lugar de navegar día a día hasta él.
 */
export default async function HabitDetailPage({
  params,
}: {
  params: Promise<{ habitId: string }>;
}) {
  const { habitId } = await params;

  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const habit = await fetchHabit(habitId, today);
  if (!habit) notFound();

  const extras = await fetchEntityExtras("HABITO", habit.id);

  const streak = currentStreak(habit.dates, today);
  const best = longestStreak(habit.dates);
  const quarter = rateOver(habit.dates, shiftDate(today, -90), today);
  const year = rateOver(habit.dates, shiftDate(today, -364), today);

  return (
    <DetailShell
      kind="HABITO"
      entityId={habit.id}
      path={`/habitos/${habit.id}`}
      backHref="/habitos"
      backLabel="Hábitos"
      icon={habit.emoji}
      title={habit.name}
      subtitle={
        habit.archivedAt
          ? "Archivado · el histórico sigue contando"
          : `${habit.dates.length} ${habit.dates.length === 1 ? "día marcado" : "días marcados"} en el último año`
      }
      colorToken="--mod-habits"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Racha actual" value={streak === 0 ? "--" : `${streak} días`} />
        <StatTile label="Racha más larga" value={best === 0 ? "--" : `${best} días`} />
        <StatTile label="Últimos 90 días" value={`${quarter}%`} />
        <StatTile label="Último año" value={`${year}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">El año, mes a mes</CardTitle>
        </CardHeader>
        <CardContent>
          <HabitMonths habitId={habit.id} marked={habit.dates} today={today} />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
