"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Pide que se refresque el calendario al abrir la pantalla, y recarga si trajo
 * algo.
 *
 * Es lo mismo que hace `SyncOnVisit` con Coinbase y por la misma razón: en el
 * plan Hobby de Vercel las tareas programadas corren una vez al día, así que
 * sin esto el dato real del IPC aparecería mañana. El servidor decide si toca
 * -- aquí no hay reloj ni umbral -- y este componente sólo empuja.
 *
 * No pinta nada. Si falla, la pantalla ya está pintada con lo que había
 * guardado, que es justo lo que tiene que pasar.
 */
export function RefreshCalendar() {
  const router = useRouter();
  const pedido = useRef(false);

  useEffect(() => {
    // Cubre también el doble montaje de React en desarrollo con Strict Mode.
    if (pedido.current) return;
    pedido.current = true;

    let cancelado = false;

    void (async () => {
      try {
        const res = await fetch("/api/economic-calendar/sync", { method: "POST" });
        const data = (await res.json()) as { ran?: boolean; events?: number };
        // Sólo se recarga cuando de verdad entró algo: un refresco por visita
        // volvería a pedir toda la página para no cambiar nada.
        if (!cancelado && data.ran && (data.events ?? 0) > 0) router.refresh();
      } catch {
        // Sin red no hay nada que hacer aquí.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [router]);

  return null;
}
