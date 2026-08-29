"use client";

import { ArrowDown, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Los dos gestos que en una aplicación instalada se dan por hechos.
 *
 * **Tirar para actualizar** y **volver deslizando desde el borde**. Sin ellos
 * se nota que por debajo hay una web, que es justo lo que no se quiere que se
 * note ahora que esto vive en un teléfono.
 *
 * Los dos sólo funcionan con el dedo (`pointerType === "touch"`): con ratón,
 * arrastrar hacia abajo es seleccionar texto, y convertir eso en una recarga
 * sería romper algo que ya funciona para arreglar algo que en el escritorio no
 * hace falta.
 */

/** Cuánto hay que tirar para que cuente. Menos y se dispara sin querer. */
const UMBRAL_TIRON = 72;
/** Y cuánto se deja arrastrar como mucho, para que el aviso no se vaya. */
const MAXIMO = 110;

/** Desde qué franja del borde izquierdo cuenta el deslizamiento para volver. */
const BORDE = 24;
const UMBRAL_DESLIZ = 80;

export function MobileGestures() {
  const router = useRouter();
  const [tiron, setTiron] = useState(0);
  const [recargando, setRecargando] = useState(false);

  const inicio = useRef<{ x: number; y: number; desdeElBorde: boolean } | null>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      inicio.current = {
        x: e.clientX,
        y: e.clientY,
        desdeElBorde: e.clientX <= BORDE,
      };
    }

    function onPointerMove(e: PointerEvent) {
      const desde = inicio.current;
      if (!desde || e.pointerType !== "touch") return;

      const dx = e.clientX - desde.x;
      const dy = e.clientY - desde.y;

      // Volver deslizando: sólo desde el borde y sólo si el gesto es
      // claramente horizontal. Sin lo segundo, cualquier desplazamiento
      // vertical que empiece pegado al borde izquierdo navegaría hacia atrás.
      if (desde.desdeElBorde && dx > UMBRAL_DESLIZ && Math.abs(dy) < dx / 2) {
        inicio.current = null;
        router.back();
        return;
      }

      // Tirar para actualizar: sólo con la página arriba del todo. Si no,
      // desplazarse hacia arriba dentro de una lista larga dispararía una
      // recarga a mitad de la lectura.
      if (window.scrollY <= 0 && dy > 0 && Math.abs(dx) < dy / 2) {
        // Con resistencia, para que se note que hay un tope y no parezca que
        // la página se ha soltado.
        setTiron(Math.min(MAXIMO, dy * 0.5));
      }
    }

    function onPointerUp() {
      const arrastrado = tiron;
      inicio.current = null;
      setTiron(0);

      if (arrastrado >= UMBRAL_TIRON * 0.5) {
        setRecargando(true);
        router.refresh();
        // El refresco del router no avisa de cuándo termina, así que el aviso
        // se quita por tiempo. Es preferible a dejarlo girando para siempre si
        // la respuesta no llega.
        window.setTimeout(() => setRecargando(false), 1200);
      }
    }

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [router, tiron]);

  if (tiron === 0 && !recargando) return null;

  const listo = tiron >= UMBRAL_TIRON * 0.5;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center md:hidden"
      style={{ transform: `translateY(${recargando ? 12 : Math.max(0, tiron - 24)}px)` }}
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-border bg-card shadow-md">
        {recargando ? (
          <RefreshCw className="size-4 animate-spin text-primary" />
        ) : (
          <ArrowDown
            className="size-4 text-muted-foreground transition-transform"
            style={{ transform: listo ? "rotate(180deg)" : "none" }}
          />
        )}
      </span>
    </div>
  );
}
