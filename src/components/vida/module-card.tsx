import {
  BookOpen,
  CircleCheck,
  Clapperboard,
  ListChecks,
  Moon,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { ModuleManifest } from "@/core/registry";

/**
 * Los iconos, resueltos aquí y no en el registro.
 *
 * El registro de módulos guarda un nombre de icono en lugar de un componente
 * para no arrastrar React ni lucide a un archivo que sólo describe módulos.
 * La correspondencia vive en la capa que dibuja, que es donde debe estar.
 */
const ICONS: Record<string, LucideIcon> = {
  TrendingUp,
  Moon,
  CircleCheck,
  BookOpen,
  ListChecks,
  UtensilsCrossed,
  Clapperboard,
};

/**
 * Una tarjeta de módulo en la pantalla de Hoy.
 *
 * El estado vacío importa más que el lleno: a las nueve de la mañana, y
 * durante las primeras semanas, casi todas las tarjetas están vacías. Si una
 * tarjeta sin datos enseña un cero o se ve rota, la aplicación parece muerta
 * justo cuando se abre. Por eso el vacío es una invitación -- «¿Cuánto
 * dormiste?» -- y no una cifra.
 */
export function ModuleCard({
  module,
  value,
}: {
  module: ModuleManifest;
  /** Ya formateado por quien sabe del módulo; aquí sólo se dibuja. */
  value: string | null;
}) {
  const Icon = ICONS[module.icon] ?? CircleCheck;
  const empty = value === null;

  return (
    <Link
      href={module.href}
      className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25"
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" style={{ color: `var(${module.colorToken})` }} aria-hidden />
        <span className="text-sm text-muted-foreground">{module.label}</span>
      </span>

      <span
        className={
          empty
            ? "text-sm text-muted-foreground"
            : "text-lg font-semibold leading-tight tabular-nums text-foreground"
        }
      >
        {empty ? module.emptyLabel : value}
      </span>
    </Link>
  );
}
