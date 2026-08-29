"use client";

import {
  Home,
  ListChecks,
  Search,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SEARCH_EVENT } from "@/components/layout/search-event";
import { cn } from "@/lib/utils";

/**
 * La barra de abajo, sólo en el móvil.
 *
 * Llegar a cualquier sección eran tres toques: hamburguesa, módulo, sección.
 * Con la aplicación instalada en el teléfono eso es la mitad del tiempo de
 * uso. Aquí los cinco destinos de diario están a uno.
 *
 * Cinco y no siete: con más, cada uno queda por debajo del tamaño mínimo de
 * toque en un teléfono estrecho, y el resto sigue estando en el menú --que no
 * desaparece, sólo deja de ser la única forma de llegar--.
 *
 * La búsqueda entra en la barra porque en el móvil no hay ⌘K: sin esto, buscar
 * es imposible sin abrir el menú.
 */
interface Destino {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sólo marca activo con la ruta exacta. Lo necesita «Hoy», que es «/». */
  exact?: boolean;
  /**
   * Otras rutas que pertenecen a este destino.
   *
   * Trading tiene sus páginas colgando de la raíz --`/trades`, `/journal`--
   * en vez de de `/trading`, así que sin esto la barra no marcaría nada
   * mientras estás dentro del módulo que más usas.
   */
  prefijos?: string[];
}

const DESTINOS: Destino[] = [
  { href: "/", label: "Hoy", icon: Home, exact: true },
  {
    href: "/trading",
    label: "Trading",
    icon: TrendingUp,
    prefijos: ["/trades", "/journal", "/analytics", "/risk", "/backtest", "/behaviour", "/review"],
  },
  { href: "/tareas", label: "Tareas", icon: ListChecks },
  { href: "/comidas", label: "Comidas", icon: UtensilsCrossed },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      // `pb-[env(safe-area-inset-bottom)]`: en un iPhone con barra de gestos,
      // sin esto los botones quedan justo debajo de ella y se pulsa el gesto
      // del sistema en vez del botón.
      className="sticky bottom-0 z-30 flex shrink-0 items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {DESTINOS.map((destino) => {
        const activo = destino.exact
          ? pathname === destino.href
          : pathname === destino.href ||
            pathname.startsWith(`${destino.href}/`) ||
            (destino.prefijos?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false);

        const Icon = destino.icon;
        return (
          <Link
            key={destino.href}
            href={destino.href}
            aria-current={activo ? "page" : undefined}
            className={cn(
              // 56px de alto: el mínimo cómodo para un dedo.
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              activo ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {destino.label}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(SEARCH_EVENT))}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors"
      >
        <Search className="size-5" aria-hidden />
        Buscar
      </button>
    </nav>
  );
}
