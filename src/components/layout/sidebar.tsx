"use client";

import {
  Activity,
  ArrowLeft,
  BookOpen,
  CircleCheck,
  Clapperboard,
  Home,
  ListChecks,
  Moon,
  Settings,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { MODULES, moduleForPath, type ModuleManifest } from "@/core/registry";
import { cn } from "@/lib/utils";

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
 * Navegación en dos estados.
 *
 * Fuera de un módulo se ven los siete módulos. Dentro de uno se ve sólo ese
 * módulo con sus secciones, y una flecha para volver.
 *
 * La razón es aritmética: con todas las secciones de todos los módulos a la
 * vez la barra tenía veintiún enlaces, y trading -- que tiene once -- ahogaba
 * a los demás. Así cada módulo puede crecer sin costarle nada al resto, que
 * es lo mismo que persigue la separación en el código.
 */
export function Sidebar() {
  const pathname = usePathname();
  const activeModule = moduleForPath(pathname);

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card px-3 py-4">
      {activeModule ? (
        <ModuleMenu module={activeModule} pathname={pathname} />
      ) : (
        <RootMenu pathname={pathname} />
      )}
    </nav>
  );
}

function RootMenu({ pathname }: { pathname: string }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2 px-2">
        <span className="size-2 rounded-full bg-primary" />
        <span className="text-sm font-semibold tracking-wide text-foreground">Vida</span>
      </div>

      <Item href="/" label="Hoy" icon={Home} active={pathname === "/"} />

      <p className="mt-3 px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Módulos
      </p>
      {MODULES.map((mod) => (
        <Item
          key={mod.id}
          href={mod.href}
          label={mod.label}
          icon={ICONS[mod.icon] ?? CircleCheck}
          colorToken={mod.colorToken}
          active={false}
        />
      ))}

      <p className="mt-3 px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Sistema
      </p>
      <Item href="/activity" label="Actividad" icon={Activity} active={pathname.startsWith("/activity")} />
      <Item href="/settings" label="Configuración" icon={Settings} active={pathname.startsWith("/settings")} />
    </>
  );
}

function ModuleMenu({ module, pathname }: { module: ModuleManifest; pathname: string }) {
  const Icon = ICONS[module.icon] ?? CircleCheck;

  // La sección activa es la coincidencia más larga: /sueno/analisis no debe
  // marcar también /sueno.
  const activeHref = module.sections
    .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <Link
        href="/"
        className="mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Todos los módulos
      </Link>

      <div className="mb-3 flex items-center gap-2 px-2">
        <Icon className="size-5 shrink-0" style={{ color: `var(${module.colorToken})` }} aria-hidden />
        <span className="text-base font-semibold tracking-tight text-foreground">{module.label}</span>
      </div>

      {module.sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={section.href === activeHref ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
            section.href === activeHref
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          style={section.href === activeHref ? { boxShadow: `inset 2px 0 0 var(${module.colorToken})` } : undefined}
        >
          {section.label}
        </Link>
      ))}
    </>
  );
}

function Item({
  href,
  label,
  icon: Icon,
  active,
  colorToken,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  colorToken?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Icon
        className="size-4 shrink-0"
        style={colorToken ? { color: `var(${colorToken})` } : undefined}
        aria-hidden
      />
      {label}
    </Link>
  );
}
