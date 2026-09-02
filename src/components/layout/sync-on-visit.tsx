"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Pide una sincronización al abrir la aplicación, y refresca si trajo algo.
 *
 * Es lo que sustituye a depender de una tarea programada cada cinco minutos:
 * en el plan Hobby de Vercel los crons sólo corren una vez al día, así que sin
 * esto las cifras que miras pueden ser de ayer. El servidor decide si toca
 * -- aquí no hay reloj ni umbral -- y este componente sólo empuja y se aparta.
 *
 * No sólo al cargar: también al volver a la pestaña y al cambiar de pantalla.
 * Una pestaña abierta desde por la mañana no vuelve a cargar la página en todo
 * el día, y con «sólo al montar» se quedaba con los datos de por la mañana:
 * así es como una liquidación de las tres de la tarde seguía sin verse a las
 * cuatro. El servidor sigue mandando en si toca o no, así que pedirlo de más
 * no cuesta nada.
 *
 * No pinta nada. Si la sincronización falla, quien lo cuenta es el aviso de
 * frescura, que ya sabe decir cuánto hace de la última buena; duplicar ese
 * mensaje aquí sería avisar dos veces de lo mismo.
 */

/** Entre dos peticiones desde este navegador, como mínimo. El servidor tiene el suyo. */
const MIN_MS_BETWEEN_REQUESTS = 30_000;

export function SyncOnVisit() {
  const router = useRouter();
  const pathname = usePathname();
  const ultimaPeticion = useRef(0);

  useEffect(() => {
    let cancelado = false;

    const pedir = async () => {
      // También cubre el doble montaje de React 19 en desarrollo con Strict
      // Mode, que antes necesitaba su propio guardia.
      const ahora = Date.now();
      if (ahora - ultimaPeticion.current < MIN_MS_BETWEEN_REQUESTS) return;
      ultimaPeticion.current = ahora;

      try {
        const res = await fetch("/api/coinbase/sync-if-stale", { method: "POST" });
        const data = (await res.json()) as { ran?: boolean };
        // Sólo se refresca cuando de verdad corrió: un refresco por visita
        // volvería a pedir todos los datos de la página para no cambiar nada.
        if (!cancelado && data.ran) router.refresh();
      } catch {
        // Sin red no hay nada que hacer aquí; la página ya está pintada.
      }
    };

    void pedir();

    const alVolver = () => {
      if (document.visibilityState === "visible") void pedir();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", alVolver);
    };
    // `pathname` está a propósito: cambiar de pantalla es otra visita.
  }, [router, pathname]);

  return null;
}
