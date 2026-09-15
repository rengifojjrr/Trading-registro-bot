"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Pide los titulares nuevos al abrir la pantalla, y recarga si trajo algo.
 *
 * Lo mismo que `RefreshCalendar` y por lo mismo: en el plan Hobby de Vercel
 * las tareas programadas corren una vez al día, y unos titulares que se
 * enteran mañana de lo que pasó esta tarde no sirven para lo que existen.
 *
 * No pinta nada. Si falla, la pantalla ya está pintada con lo que había
 * guardado, que es justo lo que tiene que pasar.
 */
export function RefreshNews() {
  const router = useRouter();
  const pedido = useRef(false);

  useEffect(() => {
    // Cubre también el doble montaje de React en desarrollo con Strict Mode.
    if (pedido.current) return;
    pedido.current = true;

    let cancelado = false;

    void (async () => {
      try {
        const res = await fetch("/api/market-news/sync", { method: "POST" });
        const data = (await res.json()) as { nuevos?: number; medidos?: number };
        // Sólo se recarga cuando de verdad cambió algo: o entró un titular, o
        // se midió alguno que estaba sin cifra. Un refresco por visita volvería
        // a pedir toda la página para no cambiar nada.
        if (!cancelado && ((data.nuevos ?? 0) > 0 || (data.medidos ?? 0) > 0)) router.refresh();
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
