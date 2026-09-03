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

/**
 * Cada cuánto se entra de verdad en una sección.
 *
 * Trading llegó a doce secciones en la misma lista plana, y varias son de
 * usar una vez en la vida (Importar, Validación) o solo cuando algo se rompe
 * (Conciliación). Puestas al mismo nivel que Operaciones, las tres cosas que
 * se miran a diario quedaban enterradas entre nueve que no.
 *
 * No se esconde nada: se agrupa. Esconder obliga a recordar dónde está.
 */
export type SectionCadence = "DIARIO" | "REPASO" | "MANTENIMIENTO";

export const CADENCE_LABELS: Record<SectionCadence, string> = {
  DIARIO: "A diario",
  REPASO: "Para repasar",
  MANTENIMIENTO: "Cuando haga falta",
};

/** Una sección dentro de un módulo: lo que aparece al entrar en él. */
export interface ModuleSection {
  href: string;
  label: string;
  /** Sin declarar, se trata como diaria: un módulo pequeño no necesita grupos. */
  cadence?: SectionCadence;
  /**
   * Un submenú dentro de la sección: el tercer estado de la navegación.
   *
   * Al entrar en una sección con hijos, la barra lateral se cambia por esta
   * lista con una flecha para volver al módulo, igual que al entrar en un
   * módulo se cambia por sus secciones. Existe para Bots, que es un módulo
   * dentro de trading: seis pantallas propias que, puestas en la lista de
   * trading, la habrían dejado en diecinueve enlaces.
   *
   * La primera hija es la portada de la sección (mismo `href`).
   */
  children?: ModuleSection[];
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
      // Lo de todos los días: mirar cómo va, y apuntar.
      { href: "/trading", label: "Panel", cadence: "DIARIO" },
      { href: "/trades", label: "Operaciones", cadence: "DIARIO" },
      { href: "/journal", label: "Diario", cadence: "DIARIO" },
      { href: "/risk", label: "Riesgo", cadence: "DIARIO" },
      // Los bots: un módulo dentro del módulo, con su propio menú.
      {
        href: "/bots",
        label: "Bots",
        cadence: "DIARIO",
        children: [
          { href: "/bots", label: "Resumen" },
          // El simulador va el segundo porque es de mirar a diario, no de
          // repasar el domingo: es donde se ve si los bots que están en papel
          // siguen operando y cómo van.
          { href: "/bots/simulador", label: "Simulador" },
          { href: "/bots/estrategias", label: "Estrategias" },
          { href: "/bots/equipo", label: "Equipo" },
          { href: "/bots/cantera", label: "Cantera" },
          { href: "/bots/riesgo", label: "Riesgo" },
          { href: "/bots/impulsos", label: "Impulsos" },
          { href: "/bots/calendario", label: "Calendario" },
        ],
      },
      // Lo que se mira el domingo, no el martes por la tarde.
      { href: "/analytics", label: "Análisis", cadence: "REPASO" },
      { href: "/backtest", label: "Backtest", cadence: "REPASO" },
      { href: "/behaviour", label: "Comportamiento", cadence: "REPASO" },
      { href: "/review", label: "Revisión", cadence: "REPASO" },
      { href: "/strategies", label: "Estrategias", cadence: "REPASO" },
      { href: "/reports", label: "Reportes", cadence: "REPASO" },
      // Una vez en la vida, o el día que algo no cuadra.
      { href: "/validation", label: "Validación", cadence: "MANTENIMIENTO" },
      { href: "/reconciliation", label: "Conciliación", cadence: "MANTENIMIENTO" },
      { href: "/import", label: "Importar", cadence: "MANTENIMIENTO" },
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
    for (const section of allSections(mod)) {
      const matches = pathname === section.href || pathname.startsWith(`${section.href}/`);
      if (matches && (best === null || section.href.length > best.length)) {
        best = { module: mod, length: section.href.length };
      }
    }
  }
  return best?.module ?? null;
}

/** Todas las secciones de un módulo, con las de los submenús incluidas. */
export function allSections(module: ModuleManifest): ModuleSection[] {
  return module.sections.flatMap((s) => [s, ...(s.children ?? [])]);
}

export interface SectionMatch {
  section: ModuleSection;
  /** La sección con submenú de la que cuelga, si está dentro de uno. */
  parent: ModuleSection | null;
}

/**
 * La sección de un módulo a la que pertenece una ruta.
 *
 * Gana la coincidencia más larga, para que /bots/equipo no se resuelva como
 * /bots. En empate gana la hija: la portada de un submenú y la sección que lo
 * abre comparten `href`, y dentro del submenú es donde hay que estar.
 */
export function sectionForPath(module: ModuleManifest, pathname: string): SectionMatch | null {
  let best: SectionMatch | null = null;

  const considerar = (section: ModuleSection, parent: ModuleSection | null) => {
    const matches = pathname === section.href || pathname.startsWith(`${section.href}/`);
    if (matches && (best === null || section.href.length >= best.section.href.length)) {
      best = { section, parent };
    }
  };

  for (const section of module.sections) {
    considerar(section, null);
    for (const child of section.children ?? []) considerar(child, section);
  }

  return best;
}
