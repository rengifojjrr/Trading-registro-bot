"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncSummary {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  fillsFetched: number;
  fillsNew: number;
  tradesCreated: number;
  tradesUpdated: number;
}

type SyncResult = { ok: true; summary: SyncSummary } | { ok: false; message: string };

/**
 * The manual trigger docs/VALIDATION_CHECKLIST.md assumes exists -- pulls
 * real fills once, right now, without requiring app_settings.auto_sync_enabled
 * (which must stay off until that checklist passes). Meant to be run a
 * handful of times while comparing results by hand, not left running.
 */
export function SyncNow() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<SyncResult | null>(null);

  async function handleSync() {
    setState("loading");
    setResult(null);
    try {
      const res = await fetch("/api/coinbase/sync-now");
      const data = (await res.json()) as SyncResult;
      setResult(data);
    } catch {
      setResult({ ok: false, message: "No se pudo contactar al servidor." });
    } finally {
      setState("done");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sincronización manual (validación)</CardTitle>
        <CardDescription>
          Trae tus fills reales de Coinbase ahora mismo, una vez, para comparar entre 20 y 50
          operaciones a mano contra lo que muestra la app -- ver{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">docs/VALIDATION_CHECKLIST.md</code>. La
          sincronización automática cada ~5 min sigue apagada hasta que actives ese interruptor más
          abajo, así que puedes correr esto varias veces sin riesgo mientras validas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div>
          <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={state === "loading"}>
            {state === "loading" ? <Loader2 className="animate-spin" /> : null}
            Sincronizar ahora
          </Button>
        </div>

        {result ? (
          result.ok ? (
            <div className="flex items-start gap-2 text-sm text-positive">
              <CheckCircle2 className="size-4 shrink-0 translate-y-0.5" aria-hidden />
              <span>
                {result.summary.fillsFetched} fill(s) recibidos de Coinbase, {result.summary.fillsNew} nuevos.{" "}
                {result.summary.tradesCreated} operación(es) nueva(s), {result.summary.tradesUpdated} actualizada(s).
                {result.summary.status === "PARTIAL" ? " (Parcial -- revisa Actividad para más detalle.)" : ""}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 translate-y-0.5" aria-hidden />
              <span>{result.message}</span>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
