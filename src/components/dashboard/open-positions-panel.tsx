"use client";

import { Decimal } from "decimal.js";
import { Loader2 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OpenPositionRow } from "@/lib/analytics/queries";
import { formatMoney, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { calculateUnrealizedPnl } from "@/lib/pnl/unrealized";

/**
 * Compact live summary of every currently-open Coinbase-synced position,
 * shown on the main dashboard -- the per-trade detail page has its own
 * fuller version (components/trades/live-unrealized-pnl.tsx). Renders
 * nothing at all if there are no open positions, rather than an empty-state
 * card competing for space with the rest of the dashboard.
 */
export function OpenPositionsPanel({ positions }: { positions: OpenPositionRow[] }) {
  if (positions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posiciones abiertas -- en vivo</CardTitle>
        <CardDescription>
          Precio y P&amp;L no realizado (bruto, igual que en Coinbase) se actualizan cada 5s.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {positions.map((position) => (
          <OpenPositionListItem key={position.id} position={position} />
        ))}
      </CardContent>
    </Card>
  );
}

function OpenPositionListItem({ position }: { position: OpenPositionRow }) {
  const { price, status } = useCurrentPrice(position.product_id);
  const openQty = new Decimal(position.total_entry_qty).minus(position.total_exit_qty).toString();

  const pnl =
    status === "ok" && price !== null
      ? calculateUnrealizedPnl({
          direction: position.direction,
          entryWap: position.entry_wap!,
          currentPrice: String(price),
          openQty,
          contractSize: position.contract_multiplier,
          entryCommissions: position.entry_commissions,
        })
      : null;

  return (
    <Link
      href={`/trades/${position.id}`}
      className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <Badge variant="outline">{position.direction === "LONG" ? "Long" : "Short"}</Badge>
        <span className="font-medium">{position.product_id}</span>
        <span className="text-muted-foreground">@ {formatMoney(position.entry_wap)}</span>
      </div>

      {status === "unavailable" ? (
        <span className="text-xs text-muted-foreground">Precio no disponible</span>
      ) : status === "loading" || !pnl ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <div className="flex items-center gap-3 tabular-nums">
          <span className="text-muted-foreground">{formatMoney(price)}</span>
          <span className={pnlColorClass(pnl.grossPnl)}>{formatSignedMoney(pnl.grossPnl)}</span>
        </div>
      )}
    </Link>
  );
}
