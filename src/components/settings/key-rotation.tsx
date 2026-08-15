"use client";

import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { markCoinbaseKeyRotated } from "@/app/(dashboard)/settings/actions";
import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { STALE_AFTER_DAYS } from "@/lib/key-rotation";

/**
 * Key age and the rotation workflow, next to the connection test that
 * proves a new key actually works.
 *
 * The order matters and the UI enforces it: rotate the key in Coinbase and
 * in the deployment's environment variables, press "probar conexión" to
 * confirm the new key answers, and only then record the date. Recording
 * first would mark a rotation that might not have worked.
 */
export function KeyRotation({
  rotatedAt,
  ageDays,
  timezone,
}: {
  rotatedAt: string | null;
  /** Computed by the server: reading the clock during render is impure and would risk a hydration mismatch. */
  ageDays: number | null;
  timezone: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const stale = ageDays === null || ageDays >= STALE_AFTER_DAYS;

  function record() {
    startTransition(async () => {
      await markCoinbaseKeyRotated();
      setConfirming(false);
      toast.success("Rotación registrada.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <KeyRound className="size-4 text-muted-foreground" aria-hidden />
        Antigüedad de la clave
        <InfoHint label="Rotación de claves">
          La clave nunca se guarda en la base de datos: vive sólo en las variables de entorno del
          servidor. Aquí se guarda únicamente la fecha, para poder avisarte. Rota la clave en Coinbase,
          actualiza la variable en tu despliegue, prueba la conexión y sólo entonces registra la fecha.
        </InfoHint>
      </p>

      <p className="text-sm text-muted-foreground">
        {rotatedAt === null ? (
          "Nunca has registrado una rotación. Si la clave es la original, considera rotarla."
        ) : (
          <>
            Última rotación registrada: {formatDate(rotatedAt, timezone)} (
            {ageDays === 0 ? "hoy" : ageDays === 1 ? "hace 1 día" : `hace ${ageDays} días`}).
          </>
        )}
      </p>

      {stale ? (
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0 translate-y-0.5" aria-hidden />
          <span>
            Conviene rotar la clave al menos cada {STALE_AFTER_DAYS} días. Es una clave de sólo lectura,
            así que no es urgente, pero tampoco es gratis dejarla indefinidamente.
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm">¿Ya probaste la conexión con la clave nueva?</span>
            <Button type="button" size="sm" onClick={record} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Sí, registrar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Registrar rotación
          </Button>
        )}
      </div>
    </div>
  );
}
