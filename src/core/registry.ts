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
}

export const MODULES: ModuleManifest[] = [
  {
    id: "trading",
    label: "Trading",
    href: "/trading",
    icon: "TrendingUp",
    colorToken: "--mod-trading",
    emptyLabel: "Sin operar hoy",
  },
  {
    id: "sleep",
    label: "Sueño",
    href: "/sueno",
    icon: "Moon",
    colorToken: "--mod-sleep",
    emptyLabel: "¿Cuánto dormiste?",
  },
  {
    id: "habits",
    label: "Hábitos",
    href: "/habitos",
    icon: "CircleCheck",
    colorToken: "--mod-habits",
    emptyLabel: "Marca los de hoy",
  },
  {
    id: "reading",
    label: "Lecturas",
    href: "/lecturas",
    icon: "BookOpen",
    colorToken: "--mod-reading",
    emptyLabel: "Sin leer hoy",
  },
  {
    id: "tasks",
    label: "Tareas",
    href: "/tareas",
    icon: "ListChecks",
    colorToken: "--mod-tasks",
    emptyLabel: "Todo al día",
  },
  {
    id: "meals",
    label: "Comidas",
    href: "/comidas",
    icon: "UtensilsCrossed",
    colorToken: "--mod-meals",
    emptyLabel: "Sin registrar",
  },
  {
    id: "content",
    label: "Contenido",
    href: "/contenido",
    icon: "Clapperboard",
    colorToken: "--mod-content",
    emptyLabel: "Nada en cola",
  },
];

export function moduleById(id: ModuleId): ModuleManifest {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Módulo desconocido: ${id}`);
  return found;
}
