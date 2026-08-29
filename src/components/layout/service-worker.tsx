"use client";

import { useEffect } from "react";

/**
 * Registra el service worker, que es lo que hace la aplicación instalable.
 *
 * Va en un componente propio y no en el layout para que el layout siga siendo
 * de servidor: registrar exige `navigator`, y convertir el layout entero en
 * cliente por esto arrastraría toda la aplicación al navegador.
 *
 * Nunca rompe nada si falla. Un navegador sin soporte, una ventana privada o
 * un registro rechazado dejan la aplicación exactamente igual de usable: lo
 * único que se pierde es la pantalla de «sin conexión» y el aviso de instalar.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // En desarrollo no se registra: un service worker sirviendo archivos
    // guardados encima de un servidor que recompila al vuelo es la forma más
    // rápida de perder una tarde persiguiendo un cambio que sí estaba hecho.
    if (process.env.NODE_ENV !== "production") return;

    const registrar = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[sw] no se pudo registrar", error);
      });
    };

    // Después de `load`: registrar durante la carga compite por el ancho de
    // banda con lo que la persona está esperando ver.
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });

    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
