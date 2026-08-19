import { Plus } from "lucide-react";
import Link from "next/link";
import { DateTime } from "luxon";

import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { MEAL_TYPE_LABELS } from "@/modules/meals/domain/meals";
import {
  planningCoverage,
  weekGrid,
  type AnalysableMeal,
} from "@/modules/meals/domain/meals-analysis";
import { fetchMeals } from "@/modules/meals/queries";

/**
 * Comidas: la semana.
 *
 * Veintiún huecos, y los vacíos se enseñan igual que los llenos porque el
 * hueco vacío es la información: es donde hay que decidir algo. Una rejilla
 * que sólo mostrara lo planificado se vería llena estando medio vacía.
 *
 * Cada hueco vacío es un enlace al formulario con el día y el tipo ya
 * puestos: rellenar el martes por la noche es un clic, no volver a elegirlo
 * todo.
 */
export default async function MealsWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string }>;
}) {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const { desde } = await searchParams;

  // La semana empieza el lunes de la semana en curso, salvo que se pida otra.
  const monday = isIsoDate(desde) ? desde : shiftDate(today, -(DateTime.fromISO(today).weekday - 1));
  const sunday = shiftDate(monday, 6);

  const rows = await fetchMeals(monday, sunday);
  const meals: AnalysableMeal[] = rows.map((m) => ({
    mealDate: m.meal_date,
    mealType: m.meal_type,
    name: m.name,
    ingredients: m.ingredients,
  }));

  const grid = weekGrid(meals, monday);
  const coverage = planningCoverage(grid);
  const planned = grid.reduce(
    (sum, day) => sum + day.slots.filter((s) => s.meals.length > 0).length,
    0,
  );

  return (
    <>
      <PageHeader
        title="La semana"
        description={`Del ${longLabel(monday)} al ${longLabel(sunday)}.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          size="lg"
          label="Huecos planificados"
          value={`${planned} de ${grid.length * 3}`}
          sub={coverage === null ? "" : `${coverage}%`}
        />
        <StatTile size="lg" label="Comidas registradas" value={String(meals.length)} sub="esta semana" />
        <StatTile
          size="lg"
          label="Sin planificar"
          value={String(grid.length * 3 - planned)}
          sub="huecos por decidir"
        />
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/comidas/semana?desde=${shiftDate(monday, -7)}`}
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          Semana anterior
        </Link>
        <Link
          href={`/comidas/semana?desde=${shiftDate(monday, 7)}`}
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          Semana siguiente
        </Link>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <div className="grid min-w-[42rem] grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-2">
            <div />
            {grid.map((day) => (
              <div
                key={day.date}
                className="pb-1 text-center text-xs font-medium"
                style={day.date === today ? { color: "var(--mod-meals)" } : undefined}
              >
                <div>{weekdayLabel(day.date)}</div>
                <div className="tabular-nums text-muted-foreground">{dayNumber(day.date)}</div>
              </div>
            ))}

            {(["DESAYUNO", "ALMUERZO", "CENA"] as const).map((type) => (
              <FragmentRow key={type} type={type} grid={grid} />
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function FragmentRow({
  type,
  grid,
}: {
  type: "DESAYUNO" | "ALMUERZO" | "CENA";
  grid: ReturnType<typeof weekGrid>;
}) {
  return (
    <>
      <div className="flex items-center pr-2 text-xs font-medium text-muted-foreground">
        {MEAL_TYPE_LABELS[type]}
      </div>
      {grid.map((day) => {
        const slot = day.slots.find((s) => s.type === type)!;
        if (slot.meals.length === 0) {
          return (
            <Link
              key={`${day.date}-${type}`}
              href={`/comidas?fecha=${day.date}&tipo=${type}`}
              aria-label={`Planificar ${MEAL_TYPE_LABELS[type].toLowerCase()} del ${day.date}`}
              className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Plus className="size-4" aria-hidden />
            </Link>
          );
        }

        return (
          <div
            key={`${day.date}-${type}`}
            className="flex min-h-16 flex-col gap-1 rounded-lg border border-border p-2"
          >
            {slot.meals.map((meal, index) => (
              <span key={`${meal.name}-${index}`} className="text-xs leading-snug">
                {meal.name}
              </span>
            ))}
          </div>
        );
      })}
    </>
  );
}

function weekdayLabel(date: string): string {
  const dt = DateTime.fromISO(date).setLocale("es");
  const text = dt.toFormat("ccc");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dayNumber(date: string): string {
  return DateTime.fromISO(date).toFormat("d");
}

function longLabel(date: string): string {
  return DateTime.fromISO(date).setLocale("es").toFormat("d 'de' LLLL");
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
