"use client";

import { usePathname } from "next/navigation";

import { moduleForPath, sectionForPath } from "@/core/registry";

const SYSTEM_TITLES: Record<string, string> = {
  "/": "Hoy",
  "/activity": "Actividad",
  "/settings": "Configuración",
};

/**
 * Dónde estás, sólo en pantallas pequeñas.
 *
 * En escritorio la barra lateral ya marca la sección activa, pero en el
 * móvil está detrás de un menú y la cabecera se leía como tres iconos
 * anónimos.
 *
 * Muestra «Módulo · Sección» porque ahora una sección puede llamarse igual
 * en dos módulos -- «Análisis» existe en sueño, lecturas, tareas y
 * contenido -- y la sección sola no diría dónde estás. Dentro de un submenú
 * es «Submenú · Sección»: «Bots · Riesgo» y no «Trading · Riesgo», que es
 * otra pantalla.
 */
export function CurrentPageTitle() {
  const pathname = usePathname();

  const active = moduleForPath(pathname);
  if (active) {
    return <span className="text-sm font-medium text-foreground md:hidden">{titulo(active, pathname)}</span>;
  }

  const system = SYSTEM_TITLES[pathname] ?? (pathname.startsWith("/settings") ? "Configuración" : null);
  if (!system) return null;

  return <span className="text-sm font-medium text-foreground md:hidden">{system}</span>;
}

function titulo(active: NonNullable<ReturnType<typeof moduleForPath>>, pathname: string): string {
  const match = sectionForPath(active, pathname);
  if (!match || match.section.href === active.href) return active.label;

  const { section, parent } = match;
  if (parent) {
    return section.href === parent.href
      ? `${active.label} · ${parent.label}`
      : `${parent.label} · ${section.label}`;
  }
  return `${active.label} · ${section.label}`;
}
