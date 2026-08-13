"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Shown when a page throws. Deliberately does NOT print the error message:
 * a server exception can carry query fragments or upstream API detail, and
 * this app's whole posture is to never leak that into the UI. The digest
 * is enough to correlate with server logs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="size-10 text-warning" aria-hidden />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">Algo salió mal en esta página</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          No se perdió ningún dato -- el error ocurrió al mostrar la información, no al guardarla. Puedes
          reintentar; si sigue pasando, revisa la sección Actividad.
        </p>
        {error.digest ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Referencia: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} size="sm">
          Reintentar
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Ir al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
