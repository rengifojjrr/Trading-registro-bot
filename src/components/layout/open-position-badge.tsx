"use client";

import Link from "next/link";

import type { OpenPositionRow } from "@/lib/analytics/queries";
import { formatSignedMoney } from "@/lib/format";
import { useCurrentPrice } from "@/lib/hooks/use-current-price";
import { calculateUnrealizedPnl } from "@/lib/pnl/unrealized";
import { cn } from "@/lib/utils";

/**
 * Lo que tienes abierto, visible desde cualquier pantalla.
 *
 * Había un panel de posiciones abiertas, y estaba solo en el Panel: para saber
 * si quedaba algo vivo había que navegar hasta él. Una posición abierta no es
 * una consulta, es un estado -- y un estado que hay que ir a buscar es uno del
 * que uno se olvida, que es justo la clase de olvido que cuesta dinero.
 *
 * No se enseña nada cuando no hay nada abierto: un indicador permanente que
 * casi siempre dice cero enseña a no mirarlo.
 */
export function OpenPositionBadge({ positions }: { positions: OpenPositionRow[] }) {
  if (positions.length === 0) return null;
  return <Badge positions={positions} />;
}

function Badge({ positions }: { positions: OpenPositionRow[] }) {
  // Un solo producto en la práctica, pero el precio se pide por el del primero
  // y el resto se suma con el suyo propio si algún día son varios.
  const { price } = useCurrentPrice(positions[0].product_id);

  const contratos = positions.reduce(
    (sum, p) => sum + (Number(p.total_entry_qty) - Number(p.total_exit_qty)),
    0,
  );

  const unrealized =
    price === null
      ? null
      : positions.reduce((sum, p) => {
          const pnl = calculateUnrealizedPnl({
            direction: p.direction,
            // El precio de lo que sigue abierto (lotes FIFO, como Coinbase),
            // no la media de todas las entradas: ver open-positions-panel.
            entryWap: p.open_lots_wap ?? p.entry_wap ?? "0",
            currentPrice: String(price),
            openQty: String(Number(p.total_entry_qty) - Number(p.total_exit_qty)),
            contractSize: p.contract_multiplier ?? "1",
            entryCommissions: p.entry_commissions ?? "0",
          });
          // Bruto y no neto: es lo mismo que enseña Coinbase, y que dos
          // pantallas den cifras distintas por la misma posición es cómo se
          // pierde la confianza en las dos.
          return sum + Number(pnl.grossPnl ?? 0);
        }, 0);

  const tono =
    unrealized === null ? "" : unrealized > 0 ? "text-positive" : unrealized < 0 ? "text-negative" : "";

  return (
    <Link
      href={`/trades/${positions[0].id}`}
      aria-label={`Posición abierta: ${contratos} contratos`}
      title="Tienes una posición abierta"
      className="flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs transition-colors hover:border-warning"
    >
      <span
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-warning"
        aria-hidden
      />
      <span className="font-medium tabular-nums">{contratos}</span>
      <span className="hidden text-muted-foreground sm:inline">abiertos</span>
      {unrealized !== null ? (
        <span className={cn("tabular-nums", tono)}>{formatSignedMoney(unrealized)}</span>
      ) : null}
    </Link>
  );
}
