import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export interface FillHistoryRow {
  id: string;
  raw_fill_id: string;
  role: "ENTRY" | "EXIT";
  allocated_size: string;
  allocated_commission: string;
  rawFill: {
    trade_time: string;
    side: "BUY" | "SELL";
    price: string;
    size: string;
    trade_type: "FILL" | "REVERSAL" | "CORRECTION" | "SYNTHETIC";
    liquidity_indicator: "MAKER" | "TAKER" | "UNKNOWN_LIQUIDITY_INDICATOR" | null;
  } | null;
}

/**
 * The literal fills the reconstruction engine allocated to this trade --
 * allocated_size/allocated_commission can be smaller than the raw fill's
 * own size/commission when that fill was split across two trades (a
 * position reversal crossing through zero, see docs/RECONCILIATION_RULES.md).
 */
export function FillHistoryTable({ fills, timezone }: { fills: FillHistoryRow[]; timezone: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de fills</CardTitle>
      </CardHeader>
      <CardContent>
        {fills.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin fills asociados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Fecha/hora</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Lado</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 text-right font-medium">Tamaño del fill</th>
                  <th className="px-3 py-2 text-right font-medium">Asignado a esta operación</th>
                  <th className="px-3 py-2 text-right font-medium">Comisión asignada</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f) => {
                  const isSplit = f.rawFill ? f.allocated_size !== f.rawFill.size : false;
                  return (
                    <tr key={f.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 tabular-nums">{formatDateTime(f.rawFill?.trade_time, timezone)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{f.role === "ENTRY" ? "Entrada" : "Salida"}</Badge>
                      </td>
                      <td className="px-3 py-2">{f.rawFill?.side ?? "--"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(f.rawFill?.price)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(f.rawFill?.size, 4)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(f.allocated_size, 4)}
                        {isSplit ? (
                          <span className="ml-1 text-xs text-warning" title="Este fill cruzó por cero y se repartió entre dos operaciones.">
                            (dividido)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(f.allocated_commission)}</td>
                      <td className="px-3 py-2">
                        {f.rawFill && f.rawFill.trade_type !== "FILL" ? (
                          <Badge variant="warning">{f.rawFill.trade_type}</Badge>
                        ) : (
                          <span className="text-muted-foreground">FILL</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
