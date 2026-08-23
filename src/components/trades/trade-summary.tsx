import type { ReactNode } from "react";

import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { InfoHint } from "@/components/shared/info-hint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSessionLabel,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

export type TradeDetail = Pick<
  Database["public"]["Tables"]["trades"]["Row"],
  | "direction"
  | "status"
  | "opened_at"
  | "closed_at"
  | "duration_seconds"
  | "max_size"
  | "total_entry_qty"
  | "total_exit_qty"
  | "entry_wap"
  | "exit_wap"
  | "notional_value"
  | "entry_commissions"
  | "exit_commissions"
  | "total_commissions"
  | "gross_pnl"
  | "net_pnl"
  | "return_pct"
  | "entries_count"
  | "exits_count"
  | "is_manually_adjusted"
  | "session_effective"
  | "source"
>;

const SOURCE_LABELS: Record<string, string> = {
  COINBASE_SYNC: "Sincronización con Coinbase",
  CSV_IMPORT: "Importación CSV",
  MANUAL: "Registrada manualmente",
  DEMO_SEED: "Datos de demostración",
  NOTION_IMPORT: "Importada de Notion",
};

/**
 * Every field here comes straight from Coinbase via the reconstruction
 * engine -- none of it is editable on this page (see JournalForm for the
 * subjective fields, kept deliberately separate).
 *
 * Layout puts the handful of numbers you actually scan for (result, entry,
 * duration, state) in one headline row, with the full eighteen-field
 * breakdown behind a fold. Previously all eighteen were shown as three
 * equal cards, so the P&L you came to see sat below the fold on a phone,
 * under things like "fills entrada / salida".
 */
export function TradeSummary({
  trade,
  accountName,
  timezone,
}: {
  trade: TradeDetail;
  accountName: string;
  timezone: string;
}) {
  const isOpen = trade.status === "OPEN";
  // Restando, no leyendo `max_size`: el tamaño máximo es el pico que llegó a
  // tener la posición, que en una que se escaló y se cerró a trozos no es ni
  // lo que entró ni lo que queda.
  const openQty = Number(trade.total_entry_qty) - Number(trade.total_exit_qty);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Headline
            label={isOpen ? "P&L (aún abierta)" : "P&L neto"}
            hint={
              isOpen
                ? "Esta operación sigue abierta, así que su P&L definitivo aún no existe. Mira la tarjeta en vivo de arriba para el estimado actual."
                : "Resultado final después de todas las comisiones de entrada y salida."
            }
            value={
              isOpen ? (
                <span className="text-muted-foreground">--</span>
              ) : (
                <span className={pnlColorClass(trade.net_pnl)}>{formatSignedMoney(trade.net_pnl)}</span>
              )
            }
            sub={isOpen ? undefined : formatPercent(trade.return_pct)}
          />
          {/* «Precio de entrada · 151 contratos» era engañoso de dos formas a
              la vez: el precio es la media de *todas* las entradas -- 211
              contratos en la posición del 19 de agosto -- y la cifra de al
              lado era el tamaño máximo alcanzado, no lo que entró ni lo que
              queda. Dos números de poblaciones distintas pegados como si
              fueran uno. */}
          <Headline
            label="Precio medio de entrada"
            value={formatMoney(trade.entry_wap)}
            hint={
              <>
                La media ponderada de las {trade.entries_count} entrada(s), {formatNumber(trade.total_entry_qty, 4)}{" "}
                contratos en total. Al cerrar parte de una posición el precio medio del resto no cambia,
                así que este número también es el de lo que sigue abierto.
              </>
            }
            sub={
              isOpen
                ? `${formatNumber(openQty, 4)} abiertos de ${formatNumber(trade.total_entry_qty, 4)}`
                : `${formatNumber(trade.total_entry_qty, 4)} contratos en ${trade.entries_count} entrada(s)`
            }
          />
          <Headline
            label={isOpen ? "Abierta desde" : "Duración"}
            value={isOpen ? formatDateTime(trade.opened_at, timezone) : formatDuration(trade.duration_seconds)}
            sub={isOpen ? undefined : formatDateTime(trade.opened_at, timezone)}
          />
          <Headline
            label="Estado"
            value={
              <Badge variant={isOpen ? "warning" : "outline"}>{isOpen ? "Abierta" : "Cerrada"}</Badge>
            }
            sub={formatSessionLabel(trade.session_effective)}
          />
        </div>

        <CollapsibleSection title="Ver todos los datos" className="border-t border-border pt-3">
          <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            <DetailRow label="Cuenta" value={accountName} />
            <DetailRow label="Apertura" value={formatDateTime(trade.opened_at, timezone)} />
            <DetailRow label="Cierre" value={formatDateTime(trade.closed_at, timezone)} />
            <DetailRow label="Duración" value={formatDuration(trade.duration_seconds)} />
            <DetailRow label="Sesión" value={formatSessionLabel(trade.session_effective)} />
            <DetailRow label="Tamaño máximo" value={formatNumber(trade.max_size, 4)} />
            <DetailRow
              label="Cantidad entrada / salida"
              value={`${formatNumber(trade.total_entry_qty, 4)} / ${formatNumber(trade.total_exit_qty, 4)}`}
            />
            <DetailRow label="Fills entrada / salida" value={`${trade.entries_count} / ${trade.exits_count}`} />
            <DetailRow label="WAP entrada" value={formatMoney(trade.entry_wap)} />
            <DetailRow label="WAP salida" value={formatMoney(trade.exit_wap)} />
            <DetailRow label="Valor nocional" value={formatMoney(trade.notional_value)} />
            <DetailRow
              label="P&L bruto"
              value={<span className={pnlColorClass(trade.gross_pnl)}>{formatSignedMoney(trade.gross_pnl)}</span>}
            />
            <DetailRow label="Comisiones entrada" value={formatMoney(trade.entry_commissions)} />
            <DetailRow label="Comisiones salida" value={formatMoney(trade.exit_commissions)} />
            <DetailRow label="Comisiones totales" value={formatMoney(trade.total_commissions)} />
            <DetailRow
              label="P&L neto"
              value={
                <span className={cn("font-semibold", pnlColorClass(trade.net_pnl))}>
                  {formatSignedMoney(trade.net_pnl)}
                </span>
              }
            />
            <DetailRow
              label="Retorno"
              value={<span className={pnlColorClass(trade.return_pct)}>{formatPercent(trade.return_pct)}</span>}
            />
            <DetailRow label="Origen" value={SOURCE_LABELS[trade.source] ?? trade.source} />
          </div>

          {trade.is_manually_adjusted ? (
            <div className="mt-3">
              <Badge variant="warning">Agrupación corregida manualmente</Badge>
            </div>
          ) : null}
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}

function Headline({
  label,
  value,
  sub,
  hint,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {sub ? <span className="text-xs text-muted-foreground tabular-nums">{sub}</span> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
