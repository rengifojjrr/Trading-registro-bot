import { ShoppingBasket } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import {
  MEAL_TYPE_LABELS,
  buildShoppingList,
  formatShoppingAmount,
} from "@/modules/meals/domain/meals";
import { fetchMeals } from "@/modules/meals/queries";
import { MealForm } from "@/modules/meals/ui/meal-form";

/**
 * Comidas.
 *
 * La lista de la compra de la semana es lo único que esto hace y Notion no
 * puede: allí los ingredientes son un párrafo, y de un párrafo no se suman
 * cantidades.
 */
export default async function MealsPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const weekEnd = shiftDate(today, 7);

  const meals = await fetchMeals(shiftDate(today, -60), weekEnd);

  const upcoming = meals.filter((m) => m.meal_date >= today && m.meal_date <= weekEnd);
  const shopping = buildShoppingList(upcoming.flatMap((m) => m.ingredients));
  const recent = meals.filter((m) => m.meal_date < today);
  const todayMeals = meals.filter((m) => m.meal_date === today);

  return (
    <>
      <PageHeader
        title="Comidas"
        description="Qué comes y qué hace falta comprar."
      />

      <Card>
        <CardHeader>
          <CardTitle>Registrar una comida</CardTitle>
          <CardDescription>
            {todayMeals.length === 0
              ? "Hoy todavía no hay ninguna."
              : `Hoy llevas ${todayMeals.length} ${todayMeals.length === 1 ? "comida" : "comidas"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MealForm date={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBasket className="size-4" style={{ color: "var(--mod-meals)" }} aria-hidden />
            Lista de la compra
          </CardTitle>
          <CardDescription>
            De todo lo planificado desde hoy hasta dentro de una semana. Las cantidades se suman por
            unidad, nunca entre unidades distintas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shopping.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada que comprar todavía. Registra comidas con ingredientes y aquí se juntan solas.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {shopping.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-4 py-2">
                  <span>{item.name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatShoppingAmount(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[...todayMeals, ...recent].length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin comidas registradas.</p>
          ) : (
            [...todayMeals, ...recent].slice(0, 40).map((meal) => (
              <div key={meal.id} className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-0 last:pb-0">
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
    </>
  );
}
