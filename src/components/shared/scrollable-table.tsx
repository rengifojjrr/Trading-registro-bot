"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Una tabla ancha que avisa de que hay más a la derecha.
 *
 * Las tablas ya se desplazaban dentro de su propio contenedor -- que es lo
 * correcto: la página nunca debe irse de lado --. Lo que faltaba era **decir
 * que se desplazan**. En el escritorio se intuye por el ancho de la pantalla;
 * en el móvil una tabla cortada por el borde derecho se lee como una tabla de
 * cuatro columnas, y las otras seis no existen.
 *
 * El degradado sólo aparece cuando de verdad hay algo más allá, y desaparece
 * al llegar al final: un indicador permanente deja de significar nada.
 */
export function ScrollableTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bordes, setBordes] = useState({ izquierda: false, derecha: false });

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    const medir = () => {
      const { scrollLeft, scrollWidth, clientWidth } = nodo;
      // Un píxel de margen: los navegadores redondean el ancho a subpíxeles y
      // sin él el degradado parpadea al llegar al extremo.
      setBordes({
        izquierda: scrollLeft > 1,
        derecha: scrollLeft + clientWidth < scrollWidth - 1,
      });
    };

    medir();
    nodo.addEventListener("scroll", medir, { passive: true });

    // Y al cambiar de tamaño: girar el teléfono puede hacer que la tabla pase
    // a caber, y entonces el degradado sobra.
    const observer = new ResizeObserver(medir);
    observer.observe(nodo);

    return () => {
      nodo.removeEventListener("scroll", medir);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className="relative">
      <div ref={ref} className={cn("overflow-x-auto", className)}>
        {children}
      </div>

      {/* `pointer-events-none`: si capturaran el puntero, arrastrar sobre el
          degradado no desplazaría la tabla, que es justo donde se arrastra. */}
      {bordes.izquierda ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent"
        />
      ) : null}
      {bordes.derecha ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent"
        />
      ) : null}
    </div>
  );
}
