import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

/** Every field here comes straight from Coinbase via the reconstruction engine -- none of it is editable on this page (see JournalForm for the subjective fields, kept deliberately separate). */
export function TradeSummary({
  trade,
  accountName,
  timezone,
}: {
  trade: TradeDetail;
  accountName: string;
  timezone: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Resumen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <DetailRow label="Cuenta" value={accountName} />
          <DetailRow
            label="Estado"
            value={
              <Badge variant={trade.status === "OPEN" ? "warning" : "outline"}>
                {trade.status === "OPEN" ? "Abierta" : "Cerrada"}
              </Badge>
            }
          />
          <DetailRow label="Apertura" value={formatDateTime(trade.opened_at, timezone)} />
          <DetailRow label="Cierre" value={formatDateTime(trade.closed_at, timezone)} />
          <DetailRow label="Duración" value={formatDuration(trade.duration_seconds)} />
          <DetailRow label="Sesión" value={formatSessionLabel(trade.session_effective)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tamaño y precios</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <DetailRow label="Tamaño máximo" value={formatNumber(trade.max_size, 4)} />
          <DetailRow
            label="Cantidad entrada / salida"
            value={`${formatNumber(trade.total_entry_qty, 4)} / ${formatNumber(trade.total_exit_qty, 4)}`}
          />
          <DetailRow label="Fills entrada / salida" value={`${trade.entries_count} / ${trade.exits_count}`} />
          <DetailRow label="WAP entrada" value={formatMoney(trade.entry_wap)} />
          <DetailRow label="WAP salida" value={formatMoney(trade.exit_wap)} />
          <DetailRow label="Valor nocional" value={formatMoney(trade.notional_value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>P&L</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
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
        </CardContent>
      </Card>

      {trade.is_manually_adjusted || trade.source !== "COINBASE_SYNC" ? (
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-wrap items-center gap-3 pt-5 text-sm text-muted-foreground">
            <span>Origen: {SOURCE_LABELS[trade.source] ?? trade.source}</span>
            {trade.is_manually_adjusted ? (
              <Badge variant="warning">Agrupación corregida manualmente</Badge>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
