import { ShoppingBasket } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { ChartFrame } from "@/core/ui/chart-frame";
import { BarSeries, RankSeries } from "@/core/ui/charts";
import { userTimezone } from "@/core/user-settings";
import { buildShoppingList, formatShoppingAmount } from "@/modules/meals/domain/meals";
import {
  commonIngredients,
  countsByType,
  repeatedMeals,
  type AnalysableMeal,
} from "@/modules/meals/domain/meals-analysis";
import { fetchMeals } from "@/modules/meals/queries";

const HORIZONS = [3, 7, 14] as const;
const HISTORY_DAYS = 90;

/**
 * Comidas: la compra.
 *
 * La lista es lo único que esto hace y Notion no puede: allí los ingredientes
 * son un párrafo, y de un párrafo no se suman cantidades.
 *
 * Debajo, lo que sólo se ve con meses de historial: qué repites y qué acabas
 * comprando siempre. Eso no es una lista de la compra, es la lista de la
 * compra de fondo.
 */
export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const { dias } = await searchParams;

  const horizon = HORIZONS.includes(Number(dias) as (typeof HORIZONS)[number])
    ? (Number(dias) as (typeof HORIZONS)[number])
    : 7;

  const rows = await fetchMeals(shiftDate(today, -HISTORY_DAYS), shiftDate(today, horizon));

  const upcoming = rows.filter((m) => m.meal_date >= today && m.meal_date <= shiftDate(today, horizon));
  const shopping = buildShoppingList(upcoming.flatMap((m) => m.ingredients));

  const history: AnalysableMeal[] = rows
    .filter((m) => m.meal_date <= today)
    .map((m) => ({
      mealDate: m.meal_date,
      mealType: m.meal_type,
      name: m.name,
      ingredients: m.ingredients,
    }));

  const repeated = repeatedMeals(history);
  const common = commonIngredients(history);
  const byType = countsByType(history);

  return (
    <>
      <PageHeader title="La compra" description="Lo que hace falta, sumado por unidad." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile size="lg" label="Cosas que comprar" value={String(shopping.length)} />
        <StatTile
          size="lg"
          label="Comidas cubiertas"
          value={String(upcoming.length)}
          sub={`próximos ${horizon} días`}
        />
        <StatTile
          size="lg"
          label="Historial"
          value={String(history.length)}
          sub={`comidas en ${HISTORY_DAYS} días`}
        />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <ShoppingBasket className="size-4" style={{ color: "var(--mod-meals)" }} aria-hidden />
              Lista de la compra
            </CardTitle>
            <CardDescription>
              De todo lo planificado desde hoy. Las cantidades se suman por unidad, nunca entre
              unidades distintas: 200 g y 2 ud no son 202 de nada.
            </CardDescription>
          </div>

          <div className="flex gap-1.5">
            {HORIZONS.map((days) => (
              <Link
                key={days}
                href={`/comidas/compra?dias=${days}`}
                aria-current={days === horizon ? "page" : undefined}
                className={
                  days === horizon
                    ? "rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-foreground"
                    : "rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                }
              >
                {days} días
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {shopping.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada que comprar todavía. Planifica comidas con ingredientes en{" "}
              <Link href="/comidas/semana" className="underline underline-offset-4">
                la semana
              </Link>{" "}
              y aquí se juntan solas.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {shopping.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-4 py-2">
                  <span>{item.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatShoppingAmount(item)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ChartFrame
        title="Lo que compras siempre"
        question={`En cuántas de tus últimas ${history.length} comidas aparece cada ingrediente.`}
        hint="Cuenta comidas, no cantidades: la pregunta es qué compras siempre, y «en catorce de veinte» dice más que «tres kilos» -- que además no se puede sumar entre gramos y unidades."
        empty={common.length === 0}
        emptyLabel="Apunta ingredientes en tus comidas y aquí sale tu compra de fondo."
      >
        <RankSeries
          data={common.slice(0, 12)}
          colorToken="--mod-meals"
          height={Math.max(160, Math.min(12, common.length) * 32 + 40)}
        />
      </ChartFrame>

      <ChartFrame
        title="Lo que más repites"
        question="Platos que han salido dos veces o más."
        empty={repeated.length === 0}
        emptyLabel="Todavía no has repetido ningún plato."
      >
        <RankSeries
          data={repeated.slice(0, 10)}
          colorToken="--mod-meals"
          height={Math.max(160, Math.min(10, repeated.length) * 32 + 40)}
        />
      </ChartFrame>

      <ChartFrame
        title="Qué comida se te olvida apuntar"
        question={`Comidas registradas de cada tipo en los últimos ${HISTORY_DAYS} días.`}
        empty={history.length === 0}
        emptyLabel="Sin historial todavía."
      >
        <BarSeries data={byType} colorToken="--mod-meals" height={200} />
      </ChartFrame>
    </>
  );
}
