"use client";

import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { formatMoney, formatPercent, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { summariseOpenTrade } from "@/lib/pnl/open-trade-total";
import { calculateUnrealizedPnl } from "@/lib/pnl/unrealized";
import { InfoHint } from "@/components/shared/info-hint";
import { LiveStatus } from "@/components/shared/live-status";
import { DriftCheck } from "@/components/trades/drift-check";
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
  allEntriesWap,
  openQty,
  contractSize,
  entryCommissions,
  realizedNetPnl,
  totalEntryQty,
  totalExitQty,
}: {
  productId: string;
  direction: "LONG" | "SHORT";
  /**
   * El precio medio de los contratos que siguen abiertos (lotes FIFO, como
   * lo cuenta Coinbase). No es la media de todas las entradas: se separan en
   * cuanto recompras después de cerrar parte, y con la media de todo esta
   * tarjeta decía verde mientras Coinbase decía rojo sobre la misma posición.
   */
  entryWap: string;
  /** La media de todas las entradas de la operación, para decir la diferencia cuando la hay. */
  allEntriesWap: string;
  openQty: string;
  contractSize: string;
  entryCommissions: string;
  /** `trades.net_pnl`: lo ya cobrado de los contratos que cerraste. */
  realizedNetPnl: string | null;
  totalEntryQty: string;
  totalExitQty: string;
}) {
  const { price, status, ageMs } = useCurrentPrice(productId);

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

  const totales = summariseOpenTrade({
    realizedNetPnl,
    unrealizedGrossPnl: calculateUnrealizedPnl({
      direction,
      entryWap,
      currentPrice: String(price),
      openQty,
      contractSize,
      entryCommissions,
    }).grossPnl,
    totalEntryQty,
    totalExitQty,
  });

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
        <CardTitle className="flex flex-wrap items-center gap-2">
          Posición abierta -- en vivo
          <LiveStatus status={status} ageMs={ageMs} />
        </CardTitle>
        <CardDescription>
          Se actualiza cada 5s con el precio actual de Coinbase. P&amp;L bruto (solo movimiento de precio) --
          igual que en Coinbase, las comisiones se muestran aparte, no incluye comisiones de salida (todavía no
          ocurrieron). El P&amp;L real se calcula solo cuando la operación cierra.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* The number this app computes, next to the number Coinbase
            reports for the same position. Everything else in the product
            computes a figure; this is the only thing that says whether it
            is right. */}
        <DriftCheck
          productId={productId}
          direction={direction}
          ours={pnl.grossPnl}
          ourSize={openQty}
          // El nocional es lo que convierte una diferencia de P&L en una
          // diferencia de precio, que es lo único comparable cuando hay
          // apalancamiento de por medio.
          notional={String(Number(openQty) * Number(contractSize) * price)}
        />

        {/* Lo cobrado y lo que depende del precio, por separado y con el
            total al lado.

            Antes sólo salía lo no realizado, así que una operación en la que
            habías cerrado parte con ganancia enseñaba únicamente la pérdida
            flotante de lo que quedaba: en la posición del 19 de agosto, -2.720
            en grande y los +862 ya cobrados en ninguna parte. Sumarlas en una
            sola cifra tampoco vale -- mezclaría dinero que ya tienes con
            dinero que depende del precio de dentro de un minuto. */}
        {totales.realized !== null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                Ya cobrado
                <InfoHint label="Ya cobrado">
                  De los {totales.closedQty} contratos que cerraste, cada uno contra el lote más antiguo
                  que quedaba (así lo cuenta Coinbase). Está en tu cuenta y no cambia, pase lo que pase
                  con el precio.
                </InfoHint>
              </p>
              <p className={cn("text-lg font-semibold tabular-nums", pnlColorClass(totales.realized))}>
                {formatSignedMoney(totales.realized)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                Flotante
                <InfoHint label="Flotante">
                  Lo que valdría cerrar ahora los {totales.openQty} contratos que siguen abiertos.
                  Cambia cada segundo y no es dinero hasta que cierres.
                </InfoHint>
              </p>
              <p className={cn("text-lg font-semibold tabular-nums", pnlColorClass(totales.unrealized))}>
                {formatSignedMoney(totales.unrealized)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cómo va en total</p>
              <p className={cn("text-lg font-semibold tabular-nums", pnlColorClass(totales.total))}>
                {formatSignedMoney(totales.total)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Precio actual</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(price)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {totales.realized !== null ? "Flotante (sólo lo abierto)" : "P\u0026L no realizado"}
            </p>
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

        {/* Sólo cuando los dos precios difieren, que es exactamente cuando
            alguien va a comparar esta cifra con Coinbase y no le va a cuadrar
            con «la media de mis entradas». */}
        {entryWap !== allEntriesWap ? (
          <p className="text-xs text-muted-foreground">
            El flotante se calcula sobre <span className="tabular-nums">{formatMoney(entryWap)}</span>, el precio
            medio de los {totales.openQty} contratos que siguen abiertos: Coinbase cierra primero los más antiguos,
            y es la cifra que enseña como precio de entrada de la posición. La media de todas tus entradas fue{" "}
            <span className="tabular-nums">{formatMoney(allEntriesWap)}</span>.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
