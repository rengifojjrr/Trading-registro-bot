"use client";

import { History } from "lucide-react";
import { useActionState } from "react";

import { ScrollableTable } from "@/components/shared/scrollable-table";
import { rebuildAsOf, type AsOfState } from "@/app/(dashboard)/validation/as-of-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSignedMoney, pnlTone } from "@/lib/format";

const initialState: AsOfState = { error: null, result: null };

const TONE_CLASS = { positive: "text-positive", negative: "text-negative", neutral: "" } as const;

/**
 * Cómo estaba la cuenta a una fecha, según lo que se sabía entonces.
 *
 * Es la prueba de que la capa cruda inmutable sirve para algo. Coinbase emite
 * correcciones retroactivas, así que la vista de hoy no es la que se vio
 * entonces; sin esto no hay forma de contestar «¿de verdad iba ganando a final
 * de julio, o es que en agosto llegó una corrección?».
 *
 * No guarda nada: lo calcula y lo enseña.
 */
export function AsOfRebuild() {
  const [state, formAction, pending] = useActionState(rebuildAsOf, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rehacer el historial a una fecha</CardTitle>
        <CardDescription>
          Vuelve a calcularlo todo usando solo las ejecuciones que existían hasta el día que elijas.
          Sirve para ver si una cifra del pasado cambió porque Coinbase mandó una corrección después.
          No guarda nada: solo lo enseña.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="as-of-date">Hasta el final del día</Label>
            <Input id="as-of-date" name="date" type="date" required className="w-auto" />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            <History className="size-4" aria-hidden />
            {pending ? "Calculando…" : "Rehacer"}
          </Button>
        </form>

        {state.error ? <p className="text-sm text-negative">{state.error}</p> : null}

        {state.result ? <AsOfReport result={state.result} /> : null}
      </CardContent>
    </Card>
  );
}

function AsOfReport({ result }: { result: NonNullable<AsOfState["result"]> }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-6">
        <Figure
          label={`Realizado hasta el ${result.asOf}`}
          value={formatSignedMoney(result.realisedNetPnl)}
          tone={pnlTone(result.realisedNetPnl)}
        />
        <Figure label="Cerradas" value={String(result.closedCount)} />
        <Figure label="Abiertas ese día" value={String(result.openCount)} />
        <Figure
          label="Ejecuciones usadas"
          value={`${result.fillsConsidered}`}
          sub={result.fillsIgnored > 0 ? `${result.fillsIgnored} posteriores ignoradas` : undefined}
        />
      </div>

      <p
        className={`text-sm ${result.laterCorrections > 0 ? "text-warning" : "text-muted-foreground"}`}
      >
        {result.note}
      </p>

      {result.trades.length > 0 ? (
        <ScrollableTable>
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Dirección</th>
                <th className="py-2 pr-3 font-medium">Abierta</th>
                <th className="py-2 pr-3 text-right font-medium">Tamaño</th>
                <th className="py-2 pr-3 text-right font-medium">Entrada</th>
                <th className="py-2 pr-3 text-right font-medium">Salida</th>
                <th className="py-2 text-right font-medium">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.trades.map((trade) => (
                <tr key={`${trade.productId}-${trade.openedAt}`}>
                  <td className="py-2 pr-3 font-mono text-xs">{trade.productId}</td>
                  <td className="py-2 pr-3">
                    {trade.direction === "LONG" ? "Largo" : "Corto"}
                    {trade.status === "OPEN" ? (
                      <span className="ml-1 text-xs text-muted-foreground">· abierta</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {trade.openedAt.slice(0, 10)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{trade.size}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{trade.entryWap}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{trade.exitWap ?? "--"}</td>
                  <td
                    className={`py-2 text-right font-medium tabular-nums ${
                      trade.netPnl === null ? "" : TONE_CLASS[pnlTone(trade.netPnl)]
                    }`}
                  >
                    {trade.netPnl === null ? "--" : formatSignedMoney(trade.netPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone ? TONE_CLASS[tone] : ""}`}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
