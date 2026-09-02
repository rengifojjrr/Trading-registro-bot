"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RepairHistoryButton } from "@/components/trades/repair-history-button";
import { SyncNowButton } from "@/components/trades/sync-now-button";

import { InfoHint } from "@/components/shared/info-hint";
import { formatSignedMoney } from "@/lib/format";
import type { DriftSeverity } from "@/lib/risk/drift";
import { cn } from "@/lib/utils";

interface DriftResponse {
  available: boolean;
  theirs?: string | null;
  theirSize?: string | null;
  ourSize?: string | null;
  severity?: DriftSeverity;
  difference?: string;
  differencePct?: number | null;
  message?: string;
}

/**
 * Puts this app's open position next to Coinbase's own figures.
 *
 * The single most important check in the product: everything else computes
 * a number, and this is the only thing that says whether the number is
 * right. Hides itself entirely when Coinbase has nothing to compare
 * against -- an absent comparison is not a discrepancy, and pretending
 * otherwise would train the user to ignore it.
 *
 * Los contratos se comparan antes que el P&L. Y cuando no cuadran, no se
 * limita a decirlo: pide la sincronización en el acto, porque un cierre que
 * Coinbase ejecutó solo -- una liquidación, un stop -- es exactamente lo que
 * la sincronización trae, y esperar a que alguien pulse un botón es dejar en
 * pantalla una posición que ya no existe.
 */
export function DriftCheck({
  productId,
  direction,
  ours,
  ourSize,
  notional,
}: {
  productId: string;
  direction: "LONG" | "SHORT";
  ours: string | null;
  /** What this app still believes is open, so a phantom position can be spotted. */
  ourSize: string | null;
  /** Contratos × tamaño de contrato × precio, para juzgar la diferencia en precio y no en P&L. */
  notional: string | null;
}) {
  const router = useRouter();
  const [drift, setDrift] = useState<DriftResponse | null>(null);
  const [autoSync, setAutoSync] = useState<"idle" | "running" | "done">("idle");
  // Una sola sincronización automática por descuadre: si después de ella los
  // contratos siguen sin cuadrar, ya no es un fill que aún no llegó, es uno
  // que falta, y eso se arregla releyendo el histórico, no insistiendo.
  const yaSincronizado = useRef(false);

  useEffect(() => {
    if (ours === null) return;
    let cancelled = false;

    async function check() {
      try {
        const query = new URLSearchParams({
          productId,
          direction,
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
  }, [productId, direction, ours, ourSize, notional]);

  // Contratos que no cuadran: pedir a Coinbase lo que falta, ahora.
  useEffect(() => {
    if (drift?.severity !== "SIZE_MISMATCH" || yaSincronizado.current) return;
    yaSincronizado.current = true;
    let cancelled = false;

    void (async () => {
      setAutoSync("running");
      try {
        const res = await fetch("/api/coinbase/sync-if-stale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true, reason: "position-mismatch" }),
        });
        const data = (await res.json()) as { ran?: boolean };
        if (cancelled) return;
        setAutoSync("done");
        // Sólo se refresca cuando de verdad corrió: la página se vuelve a
        // pedir entera y, si la operación se cerró, esta tarjeta desaparece.
        if (data.ran) router.refresh();
      } catch {
        if (!cancelled) setAutoSync("done");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [drift?.severity, router]);

  if (!drift?.available || !drift.severity) return null;

  const ok = drift.severity === "OK";
  const phantom = drift.severity === "NO_POSITION";
  const sizeMismatch = drift.severity === "SIZE_MISMATCH";

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
        <RepairHistoryButton />
      </div>
    );
  }

  // Coinbase tiene una posición, pero no la que tenemos nosotros. No hay P&L
  // que comparar hasta que los contratos cuadren.
  if (sizeMismatch) {
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-negative/50 bg-negative/5 px-3 py-2 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-negative">
          <AlertTriangle className="size-4" aria-hidden />
          Los contratos no coinciden con Coinbase
          <InfoHint label="Contratos que no cuadran">
            Se le pregunta a Coinbase cuántos contratos tiene abiertos en este producto y se compara con
            los que esta aplicación cree abiertos. Si no son los mismos, el P&amp;L no se compara: no
            tendría sentido. Lo habitual es un cierre que Coinbase ejecutó solo -- una liquidación, un
            stop o un objetivo -- que todavía no se ha sincronizado.
          </InfoHint>
        </p>
        <p className="text-xs text-muted-foreground">{drift.message}</p>
        {autoSync === "running" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Pidiendo a Coinbase lo que falta…
          </p>
        ) : (
          <div className="flex flex-wrap items-start gap-3">
            <SyncNowButton />
            {/* Si la sincronización ya corrió y sigue sin cuadrar, no es que
                falte traer lo nuevo: es que falta un fill en el histórico. */}
            {autoSync === "done" ? <RepairHistoryButton /> : null}
          </div>
        )}
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
          Primero se comprueba que los contratos abiertos son los mismos que reporta Coinbase. Después se
          le pregunta su propio P&amp;L no realizado para esta misma posición y se compara con el que
          calcula la aplicación. Una diferencia pequeña es normal: los dos números se leen en momentos
          distintos. Una diferencia que no se encoge indica un problema real de cálculo.
        </InfoHint>
      </p>
      <p className="text-xs text-muted-foreground">
        Coinbase: <span className="tabular-nums">{formatSignedMoney(drift.theirs ?? null)}</span>
        {drift.theirSize ? (
          <>
            {" · "}
            <span className="tabular-nums">{drift.theirSize.replace("-", "")}</span> contratos, los mismos que aquí
          </>
        ) : null}
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
      {!ok ? <RepairHistoryButton /> : null}
    </div>
  );
}
