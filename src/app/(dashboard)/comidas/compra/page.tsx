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
  guessAisle,
  normaliseName,
  type ShoppingLine,
} from "@/modules/meals/domain/shopping";
import { ShoppingList } from "@/modules/meals/ui/shopping-list";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
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
  const user = await requireUser();
  const supabase = await createClient();
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const { dias } = await searchParams;

  const horizon = HORIZONS.includes(Number(dias) as (typeof HORIZONS)[number])
    ? (Number(dias) as (typeof HORIZONS)[number])
    : 7;

  const rows = await fetchMeals(shiftDate(today, -HISTORY_DAYS), shiftDate(today, horizon));

  const upcoming = rows.filter((m) => m.meal_date >= today && m.meal_date <= shiftDate(today, horizon));

  // Lo añadido a mano entra en la misma suma que lo de las comidas: si la
  // semana pide dos litros de leche y además apuntaste uno, la lista tiene que
  // decir tres, no dos y uno por separado.
  const [{ data: extras }, { data: marcados }] = await Promise.all([
    supabase.from("shopping_extras").select("id, name, quantity, unit").eq("user_id", user.id),
    supabase.from("shopping_checked").select("item_key").eq("user_id", user.id),
  ]);

  const shopping = buildShoppingList([
    ...upcoming.flatMap((m) => m.ingredients),
    ...(extras ?? []).map((e) => ({
      name: e.name,
      quantity: e.quantity === null ? null : Number(e.quantity),
      unit: e.unit,
    })),
  ]);

  const nombresExtra = new Set((extras ?? []).map((e) => normaliseName(e.name)));

  const lineas: ShoppingLine[] = shopping.map((item) => ({
    key: normaliseName(item.name),
    name: item.name,
    amount: formatShoppingAmount(item),
    aisle: guessAisle(item.name),
    extra: nombresExtra.has(normaliseName(item.name)),
  }));

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
              De todo lo planificado desde hoy, más lo que añadas a mano. Agrupada por zona de la
              tienda para no cruzarla seis veces, y con lo comprado marcable: el estado se guarda,
              así que planificarlo en el ordenador y tacharlo en el móvil es lo mismo.
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
          {lineas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada que comprar todavía. Planifica comidas con ingredientes en{" "}
              <Link href="/comidas/semana" className="underline underline-offset-4">
                la semana
              </Link>{" "}
              y aquí se juntan solas. También puedes añadir cosas sueltas.
            </p>
          ) : null}

          <ShoppingList
            lines={lineas}
            checked={(marcados ?? []).map((m) => m.item_key)}
            extras={(extras ?? []).map((e) => ({ id: e.id, name: e.name }))}
          />
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
