import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { DayPicker } from "@/core/ui/day-picker";
import { userTimezone } from "@/core/user-settings";
import { completionFor, currentStreak, longestStreak, rateOver } from "@/modules/habits/domain/habits";
import { fetchHabits } from "@/modules/habits/queries";
import { HabitRow } from "@/modules/habits/ui/habit-row";
import { NewHabit } from "@/modules/habits/ui/new-habit";
import { NotionImportCard } from "@/core/ui/notion-import-card";
import { runHabitsFromNotion } from "@/modules/habits/actions";
import { habitsDatabaseId } from "@/modules/habits/notion-import";

/**
 * Hábitos.
 *
 * Los activos arriba, marcables de un toque; los archivados abajo, con su
 * histórico intacto y un botón para retomarlos.
 *
 * El día se puede mover. Antes estaba fijo en hoy, así que un olvido de ayer
 * no había forma de arreglarlo y el calendario de rachas dibujaba para siempre
 * un agujero que no había ocurrido.
 */
export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const { dia } = await searchParams;

  const timezone = await userTimezone();
  const today = todayIn(timezone);

  // Una fecha futura se ignora en lugar de aceptarse: marcar mañana no es un
  // registro, es un deseo, y mezclarlos vuelve inútil el porcentaje.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dia ?? "") && dia! <= today ? dia! : today;
  const isToday = date === today;

  const habits = await fetchHabits(today);

  const active = habits.filter((h) => h.archivedAt === null);
  const archived = habits.filter((h) => h.archivedAt !== null);

  const doneOn = (dates: string[]) => dates.includes(date);

  const completion = completionFor(
    active.map((h) => h.id),
    active.filter((h) => doneOn(h.dates)).map((h) => ({ habitId: h.id, date })),
  );

  const quarterStart = shiftDate(today, -90);
  const best = Math.max(0, ...habits.map((h) => longestStreak(h.dates)));

  return (
    <>
      <PageHeader
        title="Hábitos"
        description="Un hábito es una fila, no una columna: puedes empezar, dejar y retomar sin perder el histórico."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          size="lg"
          label={isToday ? "Hoy" : "Ese día"}
          value={completion.total === 0 ? "--" : `${completion.done} de ${completion.total}`}
          sub={completion.percent === null ? "sin hábitos activos" : `${completion.percent}%`}
        />
        <StatTile
          size="lg"
          label="Racha más larga"
          value={best === 0 ? "--" : `${best} días`}
          sub="de cualquier hábito"
        />
        <StatTile size="lg" label="Hábitos activos" value={String(active.length)} sub={`${archived.length} archivados`} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>{isToday ? "Los de hoy" : "Los de ese día"}</CardTitle>
            <CardDescription>
              Un toque para marcar. La racha no se rompe por no haber marcado todavía hoy.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <DayPicker date={date} today={today} basePath="/habitos" />
            <NewHabit />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tienes hábitos activos. Añade uno arriba para empezar.
            </p>
          ) : (
            active.map((habit) => (
              <HabitRow
                key={habit.id}
                id={habit.id}
                name={habit.name}
                emoji={habit.emoji}
                date={date}
                doneToday={doneOn(habit.dates)}
                streak={currentStreak(habit.dates, today)}
                rate={rateOver(habit.dates, quarterStart, today)}
                archived={false}
              />
            ))
          )}
        </CardContent>
      </Card>

      {archived.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Archivados</CardTitle>
            <CardDescription>
              No cuentan para el porcentaje de hoy, pero lo que hiciste sigue registrado.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {archived.map((habit) => (
              <HabitRow
                key={habit.id}
                id={habit.id}
                name={habit.name}
                emoji={habit.emoji}
                date={date}
                doneToday={doneOn(habit.dates)}
                streak={currentStreak(habit.dates, today)}
                rate={rateOver(habit.dates, quarterStart, today)}
                archived
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
      <NotionImportCard
        title="Desde Notion"
        description="Trae el histórico de «📆Hábitos 2026». Allí cada hábito es una columna; aquí cada uno es una fila y cada día marcado, otra."
        label="Traer el histórico"
        configured={habitsDatabaseId() !== null}
        missingVariable="NOTION_HABITS_DATABASE_ID"
        onImport={runHabitsFromNotion}
      />

    </>
  );
}
