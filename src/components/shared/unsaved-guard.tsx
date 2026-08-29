"use client";

import { useEffect } from "react";

/**
 * Avisa antes de perder lo escrito.
 *
 * No había un solo aviso de cambios sin guardar en toda la aplicación: una
 * entrada de diario de quince minutos se perdía entera al pulsar atrás sin
 * querer, y no había forma de recuperarla.
 *
 * Dos caminos, porque son dos cosas distintas y ninguna cubre a la otra:
 *
 *   1. **Cerrar la pestaña o recargar** lo intercepta el navegador con
 *      `beforeunload`. El texto lo pone él, no nosotros -- los navegadores
 *      dejaron de mostrar mensajes propios hace años porque se usaban para
 *      engañar --.
 *   2. **Navegar dentro de la aplicación** no dispara `beforeunload`: para el
 *      navegador no se ha ido a ninguna parte. Se intercepta el clic en los
 *      enlaces, en fase de captura, antes de que el router se entere.
 *
 * El segundo es el que de verdad importa aquí: pulsar «Operaciones» en la barra
 * lateral con el diario a medias es mucho más frecuente que cerrar la pestaña.
 */
export function UnsavedGuard({
  when,
  message = "Tienes cambios sin guardar. ¿Seguro que quieres salir?",
}: {
  when: boolean;
  message?: string;
}) {
  useEffect(() => {
    if (!when) return;

    function alDescargar(e: BeforeUnloadEvent) {
      // `preventDefault` es lo que el estándar pide hoy; `returnValue` sigue
      // haciendo falta para los navegadores que aún no lo aplican.
      e.preventDefault();
      e.returnValue = "";
    }

    function alPulsar(e: MouseEvent) {
      // Con una tecla modificadora se abre en otra pestaña, así que esta no se
      // va a ninguna parte y no hay nada que perder.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const enlace = (e.target as HTMLElement | null)?.closest?.("a");
      if (!enlace || !(enlace instanceof HTMLAnchorElement)) return;
      if (enlace.target === "_blank" || enlace.hasAttribute("download")) return;

      const destino = enlace.getAttribute("href");
      // Un ancla dentro de la misma página no navega.
      if (!destino || destino.startsWith("#")) return;

      // Otro sitio: `beforeunload` ya se encarga, y preguntar dos veces es
      // peor que preguntar una.
      const url = new URL(enlace.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", alDescargar);
    // En captura: si esperáramos a la fase de burbuja, el router de Next ya
    // habría empezado a navegar y cancelar el evento no lo detendría.
    document.addEventListener("click", alPulsar, { capture: true });

    return () => {
      window.removeEventListener("beforeunload", alDescargar);
      document.removeEventListener("click", alPulsar, { capture: true });
    };
  }, [when, message]);

  return null;
}
