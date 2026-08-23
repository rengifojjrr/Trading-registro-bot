"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Pide una sincronización al abrir la aplicación, y refresca si trajo algo.
 *
 * Es lo que sustituye a depender de una tarea programada cada cinco minutos:
 * en el plan Hobby de Vercel los crons sólo corren una vez al día, así que sin
 * esto las cifras que miras pueden ser de ayer. El servidor decide si toca
 * -- aquí no hay reloj ni umbral -- y este componente sólo empuja y se aparta.
 *
 * No pinta nada. Si la sincronización falla, quien lo cuenta es el aviso de
 * frescura, que ya sabe decir cuánto hace de la última buena; duplicar ese
 * mensaje aquí sería avisar dos veces de lo mismo.
 */
export function SyncOnVisit() {
  const router = useRouter();
  // En React 19 con Strict Mode los efectos se montan dos veces en
  // desarrollo, y esto dispara una petición: sin el guardia serían dos.
  const yaPedido = useRef(false);

  useEffect(() => {
    if (yaPedido.current) return;
    yaPedido.current = true;

    let cancelado = false;

    void (async () => {
      try {
        const res = await fetch("/api/coinbase/sync-if-stale", { method: "POST" });
        const data = (await res.json()) as { ran?: boolean };
        // Sólo se refresca cuando de verdad corrió: un refresco por visita
        // volvería a pedir todos los datos de la página para no cambiar nada.
        if (!cancelado && data.ran) router.refresh();
      } catch {
        // Sin red no hay nada que hacer aquí; la página ya está pintada.
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [router]);

  return null;
}
