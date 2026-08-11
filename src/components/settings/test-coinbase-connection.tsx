"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type TestResult =
  | { connected: true; productId: string; displayName: string; contractSize: string | null }
  | { connected: false; message: string };

/**
 * Calls the existing /api/coinbase/test-connection route (read-only, GET
 * /products/{id} only) so a freshly-configured product_id can be confirmed
 * against the real API without waiting for the next sync cron cycle.
 */
export function TestCoinbaseConnection() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<TestResult | null>(null);

  async function handleTest() {
    setState("loading");
    setResult(null);
    try {
      const res = await fetch("/api/coinbase/test-connection");
      const data = (await res.json()) as TestResult;
      setResult(data);
    } catch {
      setResult({ connected: false, message: "No se pudo contactar al servidor." });
    } finally {
      setState("done");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={state === "loading"}>
          {state === "loading" ? <Loader2 className="animate-spin" /> : null}
          Probar conexión con Coinbase
        </Button>
      </div>

      {result ? (
        result.connected ? (
          <div className="flex items-start gap-2 text-sm text-positive">
            <CheckCircle2 className="size-4 shrink-0 translate-y-0.5" aria-hidden />
            <span>
              Conectado -- {result.displayName} ({result.productId}).{" "}
              {result.contractSize
                ? `Tamaño de contrato: ${result.contractSize}.`
                : "Coinbase no devolvió un tamaño de contrato para este producto."}
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <XCircle className="size-4 shrink-0 translate-y-0.5" aria-hidden />
            <span>{result.message}</span>
          </div>
        )
      ) : null}
    </div>
  );
}
