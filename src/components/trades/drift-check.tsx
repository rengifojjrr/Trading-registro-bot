"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

import { InfoHint } from "@/components/shared/info-hint";
import { formatSignedMoney } from "@/lib/format";
import type { DriftSeverity } from "@/lib/risk/drift";
import { cn } from "@/lib/utils";

interface DriftResponse {
  available: boolean;
  theirs?: string | null;
  severity?: DriftSeverity;
  difference?: string;
  differencePct?: number | null;
  message?: string;
}

/**
 * Puts this app's unrealised P&L next to Coinbase's own figure.
 *
 * The single most important check in the product: everything else computes
 * a number, and this is the only thing that says whether the number is
 * right. Hides itself entirely when Coinbase has nothing to compare
 * against -- an absent comparison is not a discrepancy, and pretending
 * otherwise would train the user to ignore it.
 */
export function DriftCheck({
  productId,
  ours,
  ourSize,
}: {
  productId: string;
  ours: string | null;
  /** What this app still believes is open, so a phantom position can be spotted. */
  ourSize: string | null;
}) {
  const [drift, setDrift] = useState<DriftResponse | null>(null);

  useEffect(() => {
    if (ours === null) return;
    let cancelled = false;

    async function check() {
      try {
        const query = new URLSearchParams({
          productId,
          ours: String(ours),
          ourSize: String(ourSize ?? "0"),
        });
        const res = await fetch(`/api/coinbase/position-drift?${query.toString()}`);
        const data = (await res.json()) as DriftResponse;
        if (!cancelled) setDrift(data);
      } catch {
        if (!cancelled) setDrift({ available: false });
      }
    }

    void check();
    // Once a minute is plenty: this compares two slow-moving totals, and
    // the live price line already updates every few seconds.
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [productId, ours, ourSize]);

  if (!drift?.available || !drift.severity) return null;

  const ok = drift.severity === "OK";
  const phantom = drift.severity === "NO_POSITION";

  // A position Coinbase says does not exist is not a rounding difference --
  // it gets its own copy, with no figures to compare, because there is
  // nothing on the other side to compare against.
  if (phantom) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-negative/50 bg-negative/5 px-3 py-2 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-negative">
          <AlertTriangle className="size-4" aria-hidden />
          Coinbase dice que no tienes esta posición
          <InfoHint label="Posición fantasma">
            Se le pregunta a Coinbase por sus propias posiciones abiertas y no aparece ninguna para este
            producto, mientras que esta aplicación sí muestra una. Cuando eso pasa, quien se equivoca es
            la aplicación: casi siempre falta un fill en el histórico y el motor dejó un resto sin cerrar.
          </InfoHint>
        </p>
        <p className="text-xs text-muted-foreground">{drift.message}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border px-3 py-2 text-sm",
        ok ? "border-positive/40 bg-positive/5" : "border-negative/50 bg-negative/5",
      )}
    >
      <p className={cn("flex items-center gap-1.5 font-medium", ok ? "text-positive" : "text-negative")}>
        {ok ? (
          <CheckCircle2 className="size-4" aria-hidden />
        ) : (
          <AlertTriangle className="size-4" aria-hidden />
        )}
        {ok ? "Coincide con Coinbase" : "No coincide con Coinbase"}
        <InfoHint label="Comparación con Coinbase">
          Se le pregunta a Coinbase su propio P&amp;L no realizado para esta misma posición y se compara con
          el que calcula la aplicación. Una diferencia pequeña es normal: los dos números se leen en
          momentos distintos. Una diferencia que no se encoge indica un problema real de cálculo.
        </InfoHint>
      </p>
      <p className="text-xs text-muted-foreground">
        Coinbase: <span className="tabular-nums">{formatSignedMoney(drift.theirs ?? null)}</span>
        {drift.difference && !ok ? (
          <>
            {" · "}Diferencia: <span className="tabular-nums">{formatSignedMoney(drift.difference)}</span>
          </>
        ) : null}
      </p>
      {!ok ? <p className="text-xs text-muted-foreground">{drift.message}</p> : null}
    </div>
  );
}
