/**
 * The list of modules that make up Vida.
 *
 * This is the only file that knows all of them, and it knows nothing about
 * any of them beyond a name, a route and a colour. Removing a module means
 * deleting its folder and its line here -- no other file needs to change,
 * which is the whole point of the arrangement.
 *
 * Deliberately free of imports from the modules themselves: the moment this
 * file imports a module, the module can no longer be extracted without
 * dragging the registry with it.
 */

export type ModuleId =
  | "trading"
  | "sleep"
  | "habits"
  | "reading"
  | "tasks"
  | "meals"
  | "content";

/** Una sección dentro de un módulo: lo que aparece al entrar en él. */
export interface ModuleSection {
  href: string;
  label: string;
}

export interface ModuleManifest {
  id: ModuleId;
  /** Shown on the card and in the navigation. */
  label: string;
  /** Where the module lives. */
  href: string;
  /** Name of a lucide icon, resolved by the shell -- keeps this file free of React. */
  icon: string;
  /** The CSS custom property carrying the module's hue, defined in globals.css. */
  colorToken: string;
  /** One line on the card when there is nothing logged yet. Written to invite the tap. */
  emptyLabel: string;
  /**
   * Las secciones del módulo. Al entrar en él, la navegación se cambia por
   * esta lista con una flecha de volver -- ver components/layout/sidebar.
   *
   * Es lo que permite que un módulo crezca sin ahogar a los demás: trading
   * tiene once páginas y sueño tres, y ninguno ve las del otro.
   */
  sections: ModuleSection[];
}

export const MODULES: ModuleManifest[] = [
  {
    id: "trading",
    label: "Trading",
    href: "/trading",
    icon: "TrendingUp",
    colorToken: "--mod-trading",
    emptyLabel: "Sin operar hoy",
    sections: [
      { href: "/trading", label: "Panel" },
      { href: "/trades", label: "Operaciones" },
      { href: "/journal", label: "Diario" },
      { href: "/analytics", label: "Análisis" },
      { href: "/behaviour", label: "Comportamiento" },
      { href: "/review", label: "Revisión" },
      { href: "/risk", label: "Riesgo" },
      { href: "/strategies", label: "Estrategias" },
      { href: "/reports", label: "Reportes" },
      { href: "/validation", label: "Validación" },
      { href: "/reconciliation", label: "Conciliación" },
      { href: "/import", label: "Importar" },
    ],
  },
  {
    id: "sleep",
    label: "Sueño",
    href: "/sueno",
    icon: "Moon",
    colorToken: "--mod-sleep",
    emptyLabel: "¿Cuánto dormiste?",
    sections: [
      { href: "/sueno", label: "Registrar" },
      { href: "/sueno/historial", label: "Historial" },
      { href: "/sueno/analisis", label: "Análisis" },
    ],
  },
  {
    id: "habits",
    label: "Hábitos",
    href: "/habitos",
    icon: "CircleCheck",
    colorToken: "--mod-habits",
    emptyLabel: "Marca los de hoy",
    sections: [
      { href: "/habitos", label: "Hoy" },
      { href: "/habitos/calendario", label: "Calendario" },
      { href: "/habitos/rachas", label: "Rachas" },
    ],
  },
  {
    id: "reading",
    label: "Lecturas",
    href: "/lecturas",
    icon: "BookOpen",
    colorToken: "--mod-reading",
    emptyLabel: "Sin leer hoy",
    sections: [
      { href: "/lecturas", label: "Registrar" },
      { href: "/lecturas/libros", label: "Libros" },
      { href: "/lecturas/analisis", label: "Análisis" },
    ],
  },
  {
    id: "tasks",
    label: "Tareas",
    href: "/tareas",
    icon: "ListChecks",
    colorToken: "--mod-tasks",
    emptyLabel: "Todo al día",
    sections: [
      { href: "/tareas", label: "Hoy" },
      { href: "/tareas/todas", label: "Todas" },
      { href: "/tareas/calendario", label: "Calendario" },
      { href: "/tareas/proyectos", label: "Proyectos" },
      { href: "/tareas/analisis", label: "Análisis" },
    ],
  },
  {
    id: "meals",
    label: "Comidas",
    href: "/comidas",
    icon: "UtensilsCrossed",
    colorToken: "--mod-meals",
    emptyLabel: "Sin registrar",
    sections: [
      { href: "/comidas", label: "Registrar" },
      { href: "/comidas/semana", label: "Semana" },
      { href: "/comidas/compra", label: "Compra" },
    ],
  },
  {
    id: "content",
    label: "Contenido",
    href: "/contenido",
    icon: "Clapperboard",
    colorToken: "--mod-content",
    emptyLabel: "Nada en cola",
    sections: [
      { href: "/contenido", label: "Tablero" },
      { href: "/contenido/ideas", label: "Ideas" },
      { href: "/contenido/calendario", label: "Calendario" },
      { href: "/contenido/edicion", label: "Para Luis" },
      { href: "/contenido/analisis", label: "Análisis" },
    ],
  },
];

export function moduleById(id: ModuleId): ModuleManifest {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Módulo desconocido: ${id}`);
  return found;
}

/**
 * El módulo al que pertenece una ruta, si es que pertenece a alguno.
 *
 * Compara contra las secciones y no sólo contra `href`, porque las páginas
 * internas de trading (/trades, /journal…) no cuelgan de /trading y aun así
 * son suyas. Gana la coincidencia más larga, para que /sueno/analisis no se
 * resuelva como /sueno.
 */
export function moduleForPath(pathname: string): ModuleManifest | null {
  let best: { module: ModuleManifest; length: number } | null = null;

  for (const mod of MODULES) {
    for (const section of mod.sections) {
      const matches = pathname === section.href || pathname.startsWith(`${section.href}/`);
      if (matches && (best === null || section.href.length > best.length)) {
        best = { module: mod, length: section.href.length };
      }
    }
  }
  return best?.module ?? null;
}
