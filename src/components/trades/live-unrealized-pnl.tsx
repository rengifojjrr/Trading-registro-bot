"use client";

import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { formatMoney, formatPercent, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { calculateUnrealizedPnl } from "@/lib/pnl/unrealized";
import { cn } from "@/lib/utils";

/**
 * Live mark-to-market widget for an OPEN trade -- only ever rendered by the
 * trade detail page when trade.status === "OPEN" and trade.source ===
 * "COINBASE_SYNC" (see app/(dashboard)/trades/[tradeId]/page.tsx). Polls
 * the current price every 15s and recomputes the estimate client-side;
 * nothing here is persisted or treated as the trade's real P&L.
 */
export function LiveUnrealizedPnl({
  productId,
  direction,
  entryWap,
  openQty,
  contractSize,
  entryCommissions,
}: {
  productId: string;
  direction: "LONG" | "SHORT";
  entryWap: string;
  openQty: string;
  contractSize: string;
  entryCommissions: string;
}) {
  const { price, status } = useCurrentPrice(productId);

  if (status === "unavailable") return null;

  if (status === "loading" || price === null) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Cargando precio en vivo…
        </CardContent>
      </Card>
    );
  }

  const pnl = calculateUnrealizedPnl({
    direction,
    entryWap,
    currentPrice: String(price),
    openQty,
    contractSize,
    entryCommissions,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posición abierta -- en vivo</CardTitle>
        <CardDescription>
          Se actualiza cada 5s con el precio actual de Coinbase. P&amp;L bruto (solo movimiento de precio) --
          igual que en Coinbase, las comisiones se muestran aparte, no incluye comisiones de salida (todavía no
          ocurrieron). El P&amp;L real se calcula solo cuando la operación cierra.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Precio actual</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(price)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">P&amp;L no realizado</p>
            <p className={cn("text-lg font-semibold tabular-nums", pnlColorClass(pnl.grossPnl))}>
              {formatSignedMoney(pnl.grossPnl)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Retorno</p>
            <p className={cn("text-lg font-semibold tabular-nums", pnlColorClass(pnl.grossPnl))}>
              {pnl.grossReturnPct ? formatPercent(pnl.grossReturnPct) : "--"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            Comisiones de entrada: <span className="tabular-nums">{formatSignedMoney(`-${entryCommissions}`)}</span>
          </span>
          <span>
            Neto: <span className={cn("tabular-nums", pnlColorClass(pnl.netPnl))}>{formatSignedMoney(pnl.netPnl)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
