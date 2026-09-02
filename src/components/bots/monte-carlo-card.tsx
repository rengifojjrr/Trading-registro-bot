import Link from "next/link";

import { SignContractButton } from "@/components/bots/bot-buttons";
import { Badge } from "@/components/ui/badge";
import { MIN_TRADES_FOR_MONTE_CARLO, type MonteCarloResult } from "@/lib/bots/montecarlo";
import type { BotRecord } from "@/lib/bots/records";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * El Monte Carlo y el contrato de drawdown.
 *
 * Las mismas operaciones en otro orden habrían dado otra caída: barajarlas
 * trescientas veces da la distribución. El percentil 95 es lo que se firma
 * antes de darle dinero real; y si un día lo supera, no tiene mala suerte:
 * está incumpliendo contrato.
 */
export function MonteCarloCard({
  montecarlo,
  bot,
  currency,
  timezone,
  breached,
}: {
  montecarlo: MonteCarloResult | null;
  bot: BotRecord;
  currency: string;
  timezone: string;
  breached: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {bot.drawdownContractPct !== null ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={breached ? "negative" : "positive"}>
            {breached ? "Contrato incumplido" : "Contrato firmado"}
          </Badge>
          <span className="text-foreground">
            {bot.drawdownContractPct.toFixed(1)}% de drawdown máximo
            {bot.contractSignedAt ? `, firmado el ${formatDate(bot.contractSignedAt, timezone)}` : ""}.
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin contrato firmado todavía.</p>
      )}

      {montecarlo === null ? (
        <p className="text-sm text-muted-foreground">
          Hacen falta {MIN_TRADES_FOR_MONTE_CARLO} operaciones cerradas para barajar; con menos, la distribución es
          ruido.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cifra label="Observado" money={montecarlo.observed} pct={montecarlo.observedPct} currency={currency} />
            <Cifra label="Percentil 50" money={montecarlo.p50} pct={montecarlo.p50Pct} currency={currency} />
            <Cifra label="Percentil 75" money={montecarlo.p75} pct={montecarlo.p75Pct} currency={currency} />
            <Cifra label="Percentil 95" money={montecarlo.p95} pct={montecarlo.p95Pct} currency={currency} destacada />
          </dl>
          <p className="text-xs text-muted-foreground">
            {montecarlo.runs} barajadas de {montecarlo.trades} operaciones. El {montecarlo.worseThanObservedPct.toFixed(0)}%
            de los órdenes posibles habría caído más que el real; la peor, {formatMoney(montecarlo.worst, { currency })}.
          </p>

          {montecarlo.p95Pct !== null ? (
            <div>
              <SignContractButton botId={bot.id} pct={Number(montecarlo.p95Pct.toFixed(1))} resign={bot.drawdownContractPct !== null} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Para firmar en porcentaje hace falta el tamaño de la cuenta.{" "}
              <Link href="/settings" className="underline underline-offset-4">
                Ponerlo en Configuración
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Cifra({
  label,
  money,
  pct,
  currency,
  destacada = false,
}: {
  label: string;
  money: number;
  pct: number | null;
  currency: string;
  destacada?: boolean;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${destacada ? "border-primary/60 bg-primary/5" : "border-border"}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-foreground">
        {pct === null ? formatMoney(money, { currency }) : `${pct.toFixed(1)}%`}
      </dd>
      {pct !== null ? <dd className="text-xs tabular-nums text-muted-foreground">{formatMoney(money, { currency })}</dd> : null}
    </div>
  );
}
