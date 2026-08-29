"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MODULES, moduleForPath } from "@/core/registry";

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
  const seccion = modulo.sections
    .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  // En la propia sección no hay nada que decir: el título ya lo dice.
  if (!seccion || pathname === seccion.href) return null;

  const raiz = MODULES.find((m) => m.id === modulo.id);

  return (
    <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link
        href={seccion.href}
        className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        {seccion.label}
      </Link>
      {raiz ? (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <Link
            href={raiz.href}
            className="rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
          >
            {raiz.label}
          </Link>
        </>
      ) : null}
    </nav>
  );
}
