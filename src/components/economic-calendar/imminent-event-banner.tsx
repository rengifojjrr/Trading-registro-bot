"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatCountdown } from "@/lib/economic-calendar/format";
import type { CalendarEvent } from "@/lib/economic-calendar/queries";

/**
 * «El IPC sale en 45 minutos y tienes 22 contratos abiertos.»
 *
 * Es la frase entera por la que existe la sección de noticias, puesta donde de
 * verdad sirve: en el panel al que se entra, no en una pantalla a la que hay
 * que ir. Un calendario que hay que ir a consultar se consulta el día después.
 *
 * **Sólo aparece cuando las dos cosas son ciertas a la vez**: queda menos de
 * dos horas y hay posición abierta. Un aviso que sale siempre es un aviso que
 * se aprende a ignorar, y entonces ya no avisa de nada. Por eso el componente
 * devuelve `null` la mayor parte del tiempo, y por eso el servidor le pasa el
 * evento siempre y deja que sea el reloj del navegador quien decida: una
 * cuenta atrás calculada en el servidor nace vieja.
 */

/** A partir de aquí deja de ser una nota en la agenda. */
const VENTANA_MS = 2 * 60 * 60 * 1000;

export function ImminentEventBanner({
  event,
  openContracts,
}: {
  event: CalendarEvent | null;
  openContracts: number;
}) {
  const objetivo = event ? new Date(event.occursAt).getTime() : null;
  const [restante, setRestante] = useState<number | null>(null);

  const tick = useCallback(() => {
    setRestante(objetivo === null ? null : objetivo - Date.now());
  }, [objetivo]);

  useEffect(() => {
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [tick]);

  if (!event || openContracts <= 0) return null;
  if (restante === null || restante <= 0 || restante > VENTANA_MS) return null;

  const cuenta = formatCountdown(restante);
  if (!cuenta) return null;

  return (
    <Link
      href="/noticias"
      className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm transition-colors hover:border-warning"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span>
        <span className="font-medium">
          {event.title} sale en {cuenta}, y tienes {openContracts} contrato
          {openContracts === 1 ? "" : "s"} abierto{openContracts === 1 ? "" : "s"}.
        </span>{" "}
        <span className="text-muted-foreground">
          Un dato que sorprenda mueve el precio en segundos, y el margen se calcula al precio de ese
          momento. Ver el calendario.
        </span>
      </span>
    </Link>
  );
}
