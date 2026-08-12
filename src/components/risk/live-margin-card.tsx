"use client";

import { Decimal } from "decimal.js";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { calculateMarginRatioAtPrice, calculateRiskPriceForPosition, type RiskConstants } from "@/lib/risk/margin";
import { checkInitialMarginRequirement } from "@/lib/risk/product-margin";
import { cn } from "@/lib/utils";

import type { LivePositionData } from "./live-positions-section";

/** Margin ratios are never signed (0 and up, no "gain/loss" direction) -- formatPercent's +/- prefix would be misleading here. */
function formatRatio(fraction: string | null): string {
  if (fraction === null) return "≥100%";
  return `${new Decimal(fraction).times(100).toFixed(1)}%`;
}

/**
 * Live "posición en vivo" card -- combines two INDEPENDENT things, kept
 * visually separate so they're never confused: (1) our own survivability
 * model (margin ratio + risk price, driven by the user's configured
 * Maintenance Margin Rate/target ratio, since Coinbase exposes no MMR
 * endpoint), and (2) a pass/fail check against Coinbase's REAL, currently
 * synced initial-margin requirement for this exact product and direction.
 * Neither substitutes for Coinbase's own Margin Ratio / liquidation
 * estimate, which is always the operative source of truth.
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
  const { price, status } = useCurrentPrice(position.productId);
  const hasCapital = new Decimal(capital || 0).gt(0);

  const livePositionInput = {
    ...riskConstants,
    fundingRatePerHour: "0", // unused by calculateRiskPriceForPosition/calculateMarginRatioAtPrice, only satisfies the shared MarginConstants shape
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {position.displayName ?? position.productId}
          <Badge variant="outline">{position.direction === "LONG" ? "Long" : "Short"}</Badge>
        </CardTitle>
        <CardDescription>
          {position.openQty} contratos @ {formatMoney(position.entryWap)} de entrada. Margen estimado con tu
          Maintenance Margin Rate configurado ({new Decimal(riskConstants.maintenanceMarginRate).times(100).toFixed(2)}
          %) -- no es el Margin Ratio oficial de Coinbase.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasCapital ? (
          <p className="text-sm text-muted-foreground">
            Ingresa tu capital de cuenta arriba para calcular el margen de esta posición.
          </p>
        ) : status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">Precio en vivo no disponible.</p>
        ) : status === "loading" || !marginAtPrice ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Cargando precio en vivo…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Precio actual</p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Equity estimado</p>
                <p className={cn("text-lg font-semibold tabular-nums", pnlColorClass(marginAtPrice.equity))}>
                  {formatSignedMoney(marginAtPrice.equity)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Margin Ratio estimado</p>
                <p className="text-lg font-semibold tabular-nums">{formatRatio(marginAtPrice.marginRatio)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Precio de riesgo (nuestro modelo)</p>
                <p className="text-lg font-semibold tabular-nums">
                  {riskPrice.riskPrice ? formatMoney(riskPrice.riskPrice) : "No alcanzable"}
                </p>
              </div>
            </div>

            {marginCheck ? (
              <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs">
                <p className="text-muted-foreground">
                  Chequeo con el initial margin REAL de Coinbase para este producto (no un estimado):
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    Intradía ({formatMoney(marginCheck.intradayMargin)}):
                    <Badge variant={marginCheck.passesIntraday ? "positive" : "negative"}>
                      {marginCheck.passesIntraday ? "OK" : "Insuficiente"}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-1.5">
                    Overnight ({formatMoney(marginCheck.overnightMargin)}):
                    <Badge variant={marginCheck.passesOvernight ? "positive" : "negative"}>
                      {marginCheck.passesOvernight ? "OK" : "Insuficiente"}
                    </Badge>
                  </span>
                </div>
              </div>
            ) : (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                No hay datos de initial margin en vivo de Coinbase para este producto todavía.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
