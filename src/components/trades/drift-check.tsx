"use client";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { repairHistory } from "@/app/(dashboard)/settings/backfill-actions";

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
  notional,
}: {
  productId: string;
  ours: string | null;
  /** What this app still believes is open, so a phantom position can be spotted. */
  ourSize: string | null;
  /** Contratos × tamaño de contrato × precio, para juzgar la diferencia en precio y no en P&L. */
  notional: string | null;
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
          notional: String(notional ?? ""),
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
  }, [productId, ours, ourSize, notional]);

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
        <RepararHistorico />
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
      {/* La explicación también cuando coincide: si Coinbase enseña una cifra
          y esta pantalla otra, «Coincide» a secas no convence a nadie. Sólo
          se calla cuando los dos números son literalmente el mismo y no hay
          nada que explicar. */}
      {drift.message && drift.message !== "Coincide con Coinbase." ? (
        <p className="text-xs text-muted-foreground">{drift.message}</p>
      ) : null}

      {/* El descuadre que no se explica por el precio casi siempre es un fill
          que falta, y esto es lo que lo arregla. Decir «revisa que no falte
          ningún fill» sin dar el medio de revisarlo es dejar el trabajo a
          medias. */}
      {!ok ? <RepararHistorico /> : null}
    </div>
  );
}

/**
 * La cura, en el sitio donde se ve el problema.
 *
 * Existía desde el principio -- «Rehacer el histórico» en Configuración --
 * pero repartida en dos pasos y bajo un título que parece de programadores.
 * Quien está mirando una posición que Coinbase dice que no existe no tiene
 * por qué saber cómo se llama el remedio ni dónde vive: el aviso que detecta
 * el problema es el que tiene que ofrecerlo.
 */
function RepararHistorico() {
  const [pendiente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ error: string | null; message: string | null } | null>(null);

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div>
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              setResultado(await repairHistory());
            })
          }
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {pendiente ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {pendiente ? "Releyendo el histórico…" : "Volver a leer el histórico y recalcular"}
        </button>
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {resultado?.error
          ? resultado.error
          : (resultado?.message ??
            "Le pide a Coinbase el histórico completo en vez de sólo lo nuevo. No borra nada.")}
      </p>
    </div>
  );
}
