"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Volver a la lista tal y como la dejaste.
 *
 * Los filtros, el orden y la página viven en la URL, que está bien y hace que
 * una vista se pueda compartir. Lo que faltaba es la vuelta: entras a una
 * operación desde la página 4 filtrada por agosto, sales, y apareces en la
 * página 1 sin filtros. Con doce operaciones que apuntar, eso es doce veces
 * volver a montar el filtro.
 *
 * Se guarda en `sessionStorage` y no en la URL a propósito: meter el estado de
 * la lista en la dirección de la ficha ensuciaría un enlace que se comparte
 * -- «mira esta operación» acabaría llevando el filtro de quien lo mandó.
 *
 * Es por pestaña y se pierde al cerrarla, que es exactamente lo que se quiere:
 * la lista de ayer no es a la que quieres volver hoy.
 */
const KEY = "volver-a-la-lista";

export interface ListReturn {
  href: string;
  label: string;
}

/** Llamar desde la lista, para dejar la miga de pan. */
export function rememberList(entry: ListReturn) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Ventana privada o almacenamiento bloqueado. Se pierde la vuelta, no la
    // navegación: el enlace de abajo simplemente no aparece.
  }
}

export function BackToList({ fallbackHref, fallbackLabel }: { fallbackHref: string; fallbackLabel: string }) {
  // Se lee en el primer render del cliente y no en un efecto: `sessionStorage`
  // no existe en el servidor, así que el inicializador perezoso corre una sola
  // vez, ya en el navegador, y evita el render en cascada de leerlo después.
  const [entry] = useState<ListReturn | null>(() => readEntry());

  const href = entry?.href ?? fallbackHref;
  const label = entry?.label ?? fallbackLabel;

  return (
    <Link
      href={href}
      className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

/**
 * Lo guardado, comprobado antes de fiarse.
 *
 * Puede venir de una versión anterior de la aplicación, y un `href` que no
 * empiece por `/` sería un enlace a cualquier parte -- que es como una miga de
 * pan se convierte en una redirección a un sitio ajeno.
 */
function readEntry(): ListReturn | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;

    const { href, label } = parsed as Partial<ListReturn>;
    if (typeof href !== "string" || typeof label !== "string") return null;
    // Ruta interna y solo interna: `//otro.sitio` también empieza por barra.
    if (!href.startsWith("/") || href.startsWith("//")) return null;

    return { href, label };
  } catch {
    return null;
  }
}
