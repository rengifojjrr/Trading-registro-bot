"use client";

import { Decimal } from "decimal.js";
import { Loader2 } from "lucide-react";

import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { InfoHint } from "@/components/shared/info-hint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { calculateMarginRatioAtPrice, calculateRiskPriceForPosition, type RiskConstants } from "@/lib/risk/margin";
import { checkInitialMarginRequirement } from "@/lib/risk/product-margin";
import { LiveStatus } from "@/components/shared/live-status";
import { cn } from "@/lib/utils";

import type { LivePositionData } from "./live-positions-section";

/** Margin ratios are never signed (0 and up, no gain/loss direction) -- formatPercent's +/- prefix would be misleading here. */
function formatRatio(fraction: string | null): string {
  if (fraction === null) return "≥100%";
  return `${new Decimal(fraction).times(100).toFixed(1)}%`;
}

type RiskLevel = { label: string; tone: "positive" | "warning" | "negative"; barPct: number };

/**
 * Turns the raw margin ratio into the "am I in trouble?" answer, measured
 * against the user's own configured target rather than an absolute scale --
 * the target IS their definition of "too close for comfort".
 */
function riskLevel(marginRatio: string | null, targetMarginRatio: string): RiskLevel {
  if (marginRatio === null) return { label: "Sin margen", tone: "negative", barPct: 100 };

  const ratio = new Decimal(marginRatio);
  const target = new Decimal(targetMarginRatio);
  const usedPct = target.gt(0) ? ratio.dividedBy(target).times(100).toNumber() : 100;
  const barPct = Math.min(100, Math.max(0, usedPct));

  if (usedPct >= 100) return { label: "Riesgo alto", tone: "negative", barPct };
  if (usedPct >= 60) return { label: "Atención", tone: "warning", barPct };
  return { label: "Holgado", tone: "positive", barPct };
}

/**
 * Live view of one open position. Leads with the two things a trader
 * actually needs at a glance -- how much room is left before the position
 * gets uncomfortable, and at what price that happens -- and keeps the
 * underlying numbers (our survivability model vs. Coinbase's real
 * initial-margin requirement) behind a fold. Those two were previously
 * shown as co-equal blocks, which invited exactly the confusion of
 * mistaking our estimate for Coinbase's official Margin Ratio.
 */
export function LiveMarginCard({
  position,
  riskConstants,
  capital,
  reserveCash,
}: {
  position: LivePositionData;
  riskConstants: RiskConstants;
  capital: string;
  reserveCash: string;
}) {
  const { price, status, ageMs } = useCurrentPrice(position.productId);
  const hasCapital = new Decimal(capital || 0).gt(0);

  const livePositionInput = {
    ...riskConstants,
    fundingRatePerHour: "0", // unused by the two functions below, only satisfies the shared MarginConstants shape
    contractSize: position.contractSize,
    direction: position.direction,
    capital,
    reserveCash,
    entryPrice: position.entryWap,
    contracts: position.openQty,
    entryCommissions: position.entryCommissions,
  };

  const riskPrice = calculateRiskPriceForPosition(livePositionInput);
  const marginAtPrice =
    status === "ok" && price !== null ? calculateMarginRatioAtPrice(livePositionInput, String(price)) : null;

  const usableCapital = Decimal.max(0, new Decimal(capital || 0).minus(reserveCash || 0)).toString();
  const currentNotional =
    status === "ok" && price !== null
      ? new Decimal(price).times(position.openQty).times(position.contractSize).toString()
      : null;
  const marginCheck =
    position.liveMarginRates && currentNotional
      ? checkInitialMarginRequirement({
          notional: currentNotional,
          usableCapital,
          intradayMarginRate: position.liveMarginRates.intradayMarginRate,
          overnightMarginRate: position.liveMarginRates.overnightMarginRate,
        })
      : null;

  // How far price has to move against this position to reach the risk
  // price -- far more intuitive than the absolute level on its own.
  const distancePct =
    riskPrice.riskPrice && price !== null
      ? new Decimal(riskPrice.riskPrice).minus(price).dividedBy(price).times(100)
      : null;

  const level = marginAtPrice ? riskLevel(marginAtPrice.marginRatio, riskConstants.targetMarginRatio) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-foreground">
          {position.displayName ?? position.productId}
          <Badge variant="outline">{position.direction === "LONG" ? "Long" : "Short"}</Badge>
        </CardTitle>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted-foreground">
            {position.openQty} contratos @ {formatMoney(position.entryWap)}
          </span>
          <LiveStatus status={status} ageMs={ageMs} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!hasCapital ? (
          <p className="text-sm text-muted-foreground">
            Escribe tu capital arriba para ver cuánto aguanta esta posición.
          </p>
        ) : status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">Precio en vivo no disponible ahora mismo.</p>
        ) : status === "loading" || !marginAtPrice || !level ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Cargando precio en vivo…
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Esta posición aguanta hasta
                <InfoHint label="Precio de riesgo">
                  No es el precio de liquidación de Coinbase. Es el precio al que, según tu Maintenance Margin
                  Rate y tu margen objetivo configurados, la posición llegaría al límite de riesgo que tú
                  definiste. Coinbase es siempre la fuente final.
                </InfoHint>
              </span>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-bold tabular-nums">
                  {riskPrice.riskPrice ? formatMoney(riskPrice.riskPrice) : "--"}
                </span>
                {distancePct ? (
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {distancePct.abs().toFixed(1)}% {distancePct.isNegative() ? "por debajo" : "por encima"} del
                    precio actual
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  Nivel de riesgo
                  <InfoHint label="Nivel de riesgo">
                    Qué tan cerca estás de tu margen objetivo ({new Decimal(riskConstants.targetMarginRatio).times(100).toFixed(0)}%).
                    Es una estimación con tu Maintenance Margin Rate configurado, no el Margin Ratio oficial de
                    Coinbase.
                  </InfoHint>
                </span>
                <Badge variant={level.tone}>{level.label}</Badge>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn(
                    "h-full transition-all",
                    level.tone === "positive" && "bg-positive",
                    level.tone === "warning" && "bg-warning",
                    level.tone === "negative" && "bg-negative",
                  )}
                  style={{ width: `${level.barPct.toFixed(1)}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                Precio actual <span className="tabular-nums text-foreground">{formatMoney(price)}</span>
              </span>
              <span className="text-muted-foreground">
                Equity estimado{" "}
                <span className={cn("tabular-nums", pnlColorClass(marginAtPrice.equity))}>
                  {formatSignedMoney(marginAtPrice.equity)}
                </span>
              </span>
            </div>

            <CollapsibleSection title="Ver detalle del margen" className="border-t border-border pt-3">
              <dl className="flex flex-col divide-y divide-border text-sm">
                <div className="flex justify-between gap-3 py-1.5">
                  <dt className="text-muted-foreground">Margin Ratio estimado (nuestro modelo)</dt>
                  <dd className="tabular-nums">{formatRatio(marginAtPrice.marginRatio)}</dd>
                </div>
                <div className="flex justify-between gap-3 py-1.5">
                  <dt className="text-muted-foreground">Maintenance margin</dt>
                  <dd className="tabular-nums">{formatMoney(marginAtPrice.maintenanceMargin)}</dd>
                </div>
                {marginCheck ? (
                  <>
                    <div className="flex items-center justify-between gap-3 py-1.5">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        Initial margin intradía (real de Coinbase)
                        <InfoHint label="Initial margin">
                          Lo que Coinbase exige tener disponible para sostener esta posición. Este dato sí viene
                          directo de Coinbase, no es una estimación nuestra.
                        </InfoHint>
                      </dt>
                      <dd className="flex items-center gap-2 tabular-nums">
                        {formatMoney(marginCheck.intradayMargin)}
                        <Badge variant={marginCheck.passesIntraday ? "positive" : "negative"}>
                          {marginCheck.passesIntraday ? "OK" : "Insuficiente"}
                        </Badge>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-1.5">
                      <dt className="text-muted-foreground">Initial margin overnight (real de Coinbase)</dt>
                      <dd className="flex items-center gap-2 tabular-nums">
                        {formatMoney(marginCheck.overnightMargin)}
                        <Badge variant={marginCheck.passesOvernight ? "positive" : "negative"}>
                          {marginCheck.passesOvernight ? "OK" : "Insuficiente"}
                        </Badge>
                      </dd>
                    </div>
                  </>
                ) : (
                  <p className="py-1.5 text-xs text-muted-foreground">
                    Todavía no hay datos de initial margin de Coinbase para este producto.
                  </p>
                )}
              </dl>
            </CollapsibleSection>
          </>
        )}
      </CardContent>
    </Card>
  );
}
