"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Route-level boundary for the dashboard. A failing Supabase query or a bad
 * row used to take the whole section down with the framework's default
 * error screen, which says nothing useful and offers no way back.
 *
 * Deliberately does not show `error.message`: in production Next replaces
 * it with a generic string anyway, and in development a raw stack in the
 * middle of the UI is more alarming than informative. The digest is what
 * actually correlates with the server log.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] render error", error);
  }, [error]);

  return (
    <Card className="border-negative/40">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="size-6 text-negative" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-medium">No se pudo cargar esta sección</p>
          <p className="max-w-md text-sm text-muted-foreground">
            El resto de la aplicación sigue funcionando y tus datos están intactos. Si vuelve a
            ocurrir, revisa la página de Actividad.
          </p>
          {error.digest ? (
            <p className="text-xs text-muted-foreground">Referencia: {error.digest}</p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}
