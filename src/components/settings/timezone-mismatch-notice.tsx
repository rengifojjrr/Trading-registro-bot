"use client";

import { Clock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import { adoptTimezone } from "@/app/(dashboard)/settings/actions";

/**
 * «Las horas que ves no son las tuyas.»
 *
 * La zona horaria nace en `UTC` y ahí se queda hasta que alguien entra en
 * Configuración a cambiarla. Mientras tanto la aplicación enseña cada hora
 * -- cuándo abriste, cuándo cerró Coinbase, cuándo sale el dato -- desplazada
 * varias horas, sin decirlo en ninguna parte. Las cifras salen bien; las
 * horas son de otro sitio, y eso es peor que un error visible porque parece
 * correcto.
 *
 * Sólo aparece cuando el navegador dice una zona distinta de la guardada, y
 * se puede quitar: quien quiera trabajar en UTC a propósito tiene derecho a
 * que no le pregunten dos veces.
 *
 * Nada de esto se decide en el servidor porque el servidor no sabe dónde
 * estás -- corre en Vercel, en UTC. Sólo el navegador lo sabe.
 */

const DESCARTADO = "timezone-mismatch.dismissed";

/**
 * Ni la zona del navegador ni el descarte guardado cambian solos, así que no
 * hay a qué suscribirse. Definida fuera del componente porque
 * `useSyncExternalStore` exige que la función sea estable entre renders.
 */
const sinCambios = () => () => {};

/**
 * Se leen con `useSyncExternalStore` y no con estado en un efecto.
 *
 * Las dos son datos del entorno del navegador que el servidor no puede
 * conocer, y ése es justo el caso para el que existe este hook: devuelve
 * `null` al pintar en el servidor y el valor real tras hidratar, sin
 * desajuste y sin el render en cascada que provoca llamar a `setState` dentro
 * de un efecto.
 */
function leerZona(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // Sin `Intl` fiable no hay nada que comparar, y este aviso no es motivo
    // para romper una pantalla.
    return null;
  }
}

function leerDescarte(): string | null {
  try {
    return window.localStorage.getItem(DESCARTADO);
  } catch {
    return null;
  }
}

export function TimezoneMismatchNotice({ configured }: { configured: string }) {
  const router = useRouter();
  const detected = useSyncExternalStore(sinCambios, leerZona, () => null);
  const descartadoGuardado = useSyncExternalStore(sinCambios, leerDescarte, () => null);
  // El descarte de este momento va aparte: `localStorage` no avisa de sus
  // propios cambios, así que sin esto habría que recargar para que el aviso
  // desapareciera al pulsar la equis.
  const [descartadoAhora, setDescartadoAhora] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!detected || detected === configured) return null;
  if (descartadoAhora || descartadoGuardado === detected) return null;

  const ahora = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: configured,
  }).format(new Date());

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p>
          <span className="font-medium">Las horas que ves no son las tuyas.</span> Tienes la zona
          horaria en <span className="font-mono text-xs">{configured}</span>, así que aquí son las{" "}
          {ahora}. Tu dispositivo está en <span className="font-mono text-xs">{detected}</span>.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                const res = await adoptTimezone(detected);
                if (res.error) setError(res.error);
                else router.refresh();
              })
            }
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {pendiente ? "Cambiando…" : `Usar ${detected}`}
          </button>
          <span className="text-xs text-muted-foreground">
            Cambia sólo cómo se muestran las horas. No toca ninguna operación.
          </span>
        </div>

        {error ? <p className="text-xs text-negative">{error}</p> : null}
      </div>

      <button
        type="button"
        aria-label="Descartar el aviso de zona horaria"
        onClick={() => {
          // Se recuerda contra la zona detectada: si mañana viaja y el
          // navegador dice otra cosa, vuelve a preguntar.
          try {
            window.localStorage.setItem(DESCARTADO, detected);
          } catch {
            // Sin almacenamiento, el aviso volverá. Es el fallo correcto.
          }
          setDescartadoAhora(true);
        }}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
