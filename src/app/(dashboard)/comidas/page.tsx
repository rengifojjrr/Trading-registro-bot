import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { MEAL_TYPES, MEAL_TYPE_LABELS, type MealType } from "@/modules/meals/domain/meals";
import { fetchMeals } from "@/modules/meals/queries";
import { MealForm } from "@/modules/meals/ui/meal-form";
import { NotionImportCard } from "@/core/ui/notion-import-card";
import { runMealsFromNotion } from "@/modules/meals/actions";
import { mealsDatabaseId } from "@/modules/meals/notion-import";

/**
 * Comidas: registrar.
 *
 * El formulario acepta cualquier día, no sólo hoy: esto es un planificador, y
 * planificar es escribir el martes que viene. La rejilla de la semana enlaza
 * aquí con el día y el tipo ya puestos, para que rellenar un hueco sea un
 * clic y no volver a elegirlo todo.
 */
export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; tipo?: string }>;
}) {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const { fecha, tipo } = await searchParams;

  const date = isIsoDate(fecha) ? fecha : today;
  const defaultType = isMealType(tipo) ? tipo : "ALMUERZO";

  const meals = await fetchMeals(shiftDate(today, -30), shiftDate(today, 14));
  const todayMeals = meals.filter((m) => m.meal_date === today);
  const history = meals.filter((m) => m.meal_date <= today).slice(0, 30);

  return (
    <>
      <PageHeader title="Registrar comida" description="Qué se come, y con qué. De ahí sale la compra." />

      <Card>
        <CardHeader>
          <CardTitle>Nueva comida</CardTitle>
          <CardDescription>
            {todayMeals.length === 0
              ? "Hoy todavía no hay ninguna registrada."
              : `Hoy llevas ${todayMeals.length} ${todayMeals.length === 1 ? "comida" : "comidas"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Remontar al cambiar de hueco: los campos por defecto sólo se leen
              al montar, y sin esto el enlace de la rejilla no cambiaría nada. */}
          <MealForm key={`${date}-${defaultType}`} date={date} defaultType={defaultType} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas comidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin comidas registradas.</p>
          ) : (
            history.map((meal) => (
              <div
                key={meal.id}
                className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Badge variant="outline">{MEAL_TYPE_LABELS[meal.meal_type]}</Badge>
                  <span className="font-medium">{meal.name}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {formatDate(`${meal.meal_date}T00:00:00Z`, timezone)}
                  </span>
                </div>
                {meal.ingredients.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {meal.ingredients.map((i) => i.name).join(", ")}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <NotionImportCard
        title="Desde Notion"
        description="Trae el «🍳 Planificador de Comidas». El párrafo de ingredientes se parte en filas al entrar, que es lo que hace posible la lista de la compra."
        label="Traer las comidas"
        configured={mealsDatabaseId() !== null}
        missingVariable="NOTION_MEALS_DATABASE_ID"
        onImport={runMealsFromNotion}
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <Link href="/comidas/semana" className="underline underline-offset-4 hover:text-foreground">
          Ver la semana
        </Link>
        <Link href="/comidas/compra" className="underline underline-offset-4 hover:text-foreground">
          Ver la lista de la compra
        </Link>
      </div>
    </>
  );
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMealType(value: string | undefined): value is MealType {
  return typeof value === "string" && (MEAL_TYPES as readonly string[]).includes(value);
}
