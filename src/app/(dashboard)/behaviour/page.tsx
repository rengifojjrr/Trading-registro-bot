import { Brain } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { CommissionDragCard } from "@/components/behaviour/commission-drag-card";
import { DailyLimitsCard } from "@/components/behaviour/daily-limits-card";
import { MistakeCostTable } from "@/components/behaviour/mistake-cost-table";
import { StreakSizingCard } from "@/components/behaviour/streak-sizing-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeCommissionDrag,
  computeDailyLimitBreaches,
  computeExpectancy,
  computeMistakeCost,
  computeStreakSizing,
} from "@/lib/analytics/behaviour";
import { fetchTradesWithBehaviour } from "@/lib/analytics/behaviour-queries";
import { parseTradeFilters } from "@/lib/analytics/filter-params";
import { requireUser } from "@/lib/auth/require-user";
import { formatMoney, formatNumber, formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * The analytics about the trader rather than the market.
 *
 * Everything else in this app answers "what happened". This page answers
 * "what am I doing that costs me money" -- which mistakes are expensive,
 * whether losing runs change position size, how much the broker takes, and
 * whether any of the activity beat sitting still.
 */
export default async function BehaviourPage(props: PageProps<"/behaviour">) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone, max_daily_loss, max_trades_per_day")
    .eq("user_id", user.id)
    .maybeSingle();

  const timezone = settings?.timezone || "UTC";
  const filters = parseTradeFilters(searchParams, timezone);
  const trades = await fetchTradesWithBehaviour(filters);

  const closedCount = trades.filter((t) => t.status === "CLOSED" && t.netPnl !== null).length;

  if (closedCount === 0) {
    return (
      <>
        <PageHeader
          title="Comportamiento"
          description="Qué te está costando dinero de lo que haces, no de lo que hace el mercado."
        />
        <EmptyState
          icon={Brain}
          title="Todavía no hay operaciones cerradas que analizar"
          description="Cuando cierres operaciones y empieces a etiquetar los errores en cada una, aquí verás cuáles te cuestan más y si las rachas te cambian el tamaño."
        />
      </>
    );
  }

  const mistakes = computeMistakeCost(trades);
  const streaks = computeStreakSizing(trades);
  const drag = computeCommissionDrag(trades);
  const expectancy = computeExpectancy(trades);
  const limits = computeDailyLimitBreaches(trades, timezone, {
    maxDailyLoss: settings?.max_daily_loss ? Number(settings.max_daily_loss) : null,
    maxTradesPerDay: settings?.max_trades_per_day ?? null,
  });

  return (
    <>
      <PageHeader
        title="Comportamiento"
        description="Qué te está costando dinero de lo que haces, no de lo que hace el mercado."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          size="lg"
          label="Expectativa"
          value={expectancy.expectancy === null ? "--" : formatSignedMoney(expectancy.expectancy)}
          tone={pnlTone(expectancy.expectancy)}
          sub="por operación cerrada"
          description="Resultado neto medio por operación. Es lo que puedes esperar ganar (o perder) cada vez que operas, según tu propio historial."
        />
        <StatTile
          size="lg"
          label="Ratio ganancia/pérdida"
          value={expectancy.payoffRatio === null ? "--" : formatNumber(expectancy.payoffRatio)}
          sub={
            expectancy.averageWin && expectancy.averageLoss
              ? `${formatMoney(expectancy.averageWin)} vs ${formatMoney(expectancy.averageLoss)}`
              : undefined
          }
          description="Ganancia media dividida entre pérdida media. Con un ratio de 2 puedes acertar solo un tercio de las veces y seguir ganando."
        />
        <StatTile
          size="lg"
          label="Riesgo de ruina"
          value={expectancy.riskOfRuin === null ? "--" : formatPercent(expectancy.riskOfRuin * 100)}
          tone={
            expectancy.riskOfRuin === null
              ? "neutral"
              : expectancy.riskOfRuin > 0.05
                ? "negative"
                : "positive"
          }
          sub="con 20 unidades de riesgo"
          description="Probabilidad estimada de perder la cuenta entera si sigues operando con esta misma distribución de resultados y riesgo fijo por operación. Es una estimación: asume que el pasado predice el futuro."
        />
        <StatTile
          size="lg"
          label="Peso de las comisiones"
          value={drag.dragPct === null ? "--" : formatPercent(drag.dragPct)}
          tone={drag.dragPct === null ? "neutral" : drag.dragPct >= 30 ? "negative" : "neutral"}
          sub="de tu ganancia bruta"
          description="Cuánto de lo que ganaste antes de costes se lo llevan las comisiones."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qué dice tu distribución</CardTitle>
          <CardDescription>{expectancy.message}</CardDescription>
        </CardHeader>
      </Card>

      <MistakeCostTable rows={mistakes} />
      <StreakSizingCard effect={streaks} />
      <CommissionDragCard drag={drag} />
      <DailyLimitsCard
        days={limits}
        hasLimits={Boolean(settings?.max_daily_loss || settings?.max_trades_per_day)}
      />
    </>
  );
}
