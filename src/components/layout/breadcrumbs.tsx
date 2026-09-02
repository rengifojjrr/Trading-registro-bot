"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { moduleForPath, sectionForPath } from "@/core/registry";

/**
 * Dónde estás y cómo volver un paso.
 *
 * Dentro de un módulo la única salida era «Todos los módulos», que es volver al
 * principio. Desde el detalle de una tarea de un proyecto, volver al proyecto
 * eran dos pasos hacia atrás a ciegas -- y el botón del navegador no siempre
 * lleva ahí, porque depende de por dónde llegaste, no de dónde estás.
 *
 * Se calcula de la ruta y no de un registro de navegación a propósito: «el
 * padre de esta página» es una propiedad de la página, siempre la misma. Un
 * registro de por dónde pasaste da respuestas distintas cada vez.
 */
export function Breadcrumbs() {
  const pathname = usePathname();
  const modulo = moduleForPath(pathname);
  if (!modulo) return null;

  // La sección a la que pertenece: la coincidencia más larga, para que
  // /tareas/proyectos/xxx no se resuelva como /tareas.
  const match = sectionForPath(modulo, pathname);

  // En la propia sección no hay nada que decir: el título ya lo dice.
  if (!match || pathname === match.section.href) return null;

  const { section, parent } = match;

  // El paso atrás y, detrás, de dónde cuelga. Dentro de un submenú el paso
  // atrás es el submenú (la ficha de un bot vuelve a Bots, no a «Resumen»),
  // y detrás va el módulo.
  const pasos = [
    parent && parent.href === section.href ? parent : section,
    ...(parent && parent.href !== section.href ? [parent] : []),
    modulo,
  ];

  return (
    <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-muted-foreground">
      {pasos.map((paso, i) => (
        <span key={paso.href} className="flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="opacity-50">
              ·
            </span>
          ) : null}
          <Link
            href={paso.href}
            className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
          >
            {i === 0 ? <ChevronLeft className="size-3.5" aria-hidden /> : null}
            {paso.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
