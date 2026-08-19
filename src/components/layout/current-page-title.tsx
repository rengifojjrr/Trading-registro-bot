"use client";

import { usePathname } from "next/navigation";

import { moduleForPath } from "@/core/registry";

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
 * contenido -- y la sección sola no diría dónde estás.
 */
export function CurrentPageTitle() {
  const pathname = usePathname();

  const active = moduleForPath(pathname);
  if (active) {
    const section = active.sections
      .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0];

    const label =
      section && section.href !== active.href ? `${active.label} · ${section.label}` : active.label;
    return <span className="text-sm font-medium text-foreground md:hidden">{label}</span>;
  }

  const system = SYSTEM_TITLES[pathname] ?? (pathname.startsWith("/settings") ? "Configuración" : null);
  if (!system) return null;

  return <span className="text-sm font-medium text-foreground md:hidden">{system}</span>;
}
