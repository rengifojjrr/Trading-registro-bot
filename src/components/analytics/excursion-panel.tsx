"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExcursionSummary } from "@/lib/analytics/breakdowns";
import { formatMoney } from "@/lib/format";

/**
 * "Do I exit too early?" panel, plus the control that populates it.
 *
 * MFE/MAE needs one Coinbase candles request per trade, so it's computed
 * in explicit user-triggered batches rather than on page load -- see
 * api/analytics/backfill-extremes. The panel always states how many trades
 * it actually covers, because a summary over 3 of 200 trades is not the
 * same claim as one over 200.
 */
export function ExcursionPanel({
  summary,
  totalClosed,
  currency,
}: {
  summary: ExcursionSummary;
  totalClosed: number;
  currency: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(null);
  const missing = Math.max(0, totalClosed - summary.sampleSize);

  function runBackfill() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/analytics/backfill-extremes", { method: "POST" });
        const data = (await res.json()) as {
          error: string | null;
          computed: number;
          unavailable: number;
          remaining: number;
        };
        if (data.error) {
          toast.error(data.error);
          return;
        }
        setRemaining(data.remaining);
        toast.success(
          `Calculadas ${data.computed} operaciones` +
            (data.unavailable > 0 ? `, ${data.unavailable} sin velas disponibles` : "") +
            (data.remaining > 0 ? `. Faltan ${data.remaining}.` : "."),
        );
        // The numbers above come from the server on the next render.
        if (data.computed > 0) window.location.reload();
      } catch {
        toast.error("No se pudo calcular. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-foreground">
          ¿Sales demasiado pronto?
          <InfoHint label="Recorrido máximo">
            Compara lo máximo que llegó a ganar cada operación mientras estaba abierta contra lo que finalmente
            te llevaste. Se calcula con velas de Coinbase, así que es una aproximación, no un valor exacto al
            tick.
          </InfoHint>
        </CardTitle>
        <CardDescription>
          {summary.sampleSize === 0
            ? `Sin calcular todavía${totalClosed > 0 ? ` (${totalClosed} operaciones cerradas disponibles)` : ""}.`
            : `Calculado sobre ${summary.sampleSize} de ${totalClosed} operaciones cerradas.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {summary.sampleSize > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Mejor momento promedio" value={formatMoney(summary.averageMfe, { currency })} />
              <Metric label="Peor momento promedio" value={formatMoney(summary.averageMae, { currency })} />
              <Metric
                label="Devuelto en ganadoras"
                value={formatMoney(summary.averageGiveBack, { currency })}
                hint="En las operaciones que cerraste en ganancia, cuánto llegaste a tener de más en el mejor momento respecto a lo que finalmente te llevaste."
              />
              <Metric
                label="Ganadoras que devolvieron +50%"
                value={summary.gaveBackHalfPct === null ? "--" : `${summary.gaveBackHalfPct.toFixed(0)}%`}
              />
            </div>

            {summary.gaveBackHalfPct !== null && summary.gaveBackHalfPct >= 50 ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Más de la mitad de tus operaciones ganadoras devolvieron más del 50% de lo que llegaron a ganar.
                Vale la pena revisar dónde estás cerrando.
              </p>
            ) : null}
          </>
        ) : null}

        {missing > 0 || remaining ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={runBackfill} disabled={isPending}>
              {isPending ? "Calculando…" : `Calcular ${Math.min(15, missing)} operaciones`}
            </Button>
            <span className="text-xs text-muted-foreground">
              Se hace por lotes para no saturar la API de Coinbase.
              {remaining !== null && remaining > 0 ? ` Faltan ${remaining}.` : ""}
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
