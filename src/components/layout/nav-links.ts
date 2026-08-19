import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Brain,
  BookOpen,
  CalendarCheck,
  CircleCheck,
  Clapperboard,
  FileText,
  Home,
  ListChecks,
  ListOrdered,
  Moon,
  Settings,
  Shield,
  ShieldCheck,
  Scale,
  Target,
  TrendingUp,
  Upload,
  UtensilsCrossed,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Custom property del color del módulo, cuando la entrada es un módulo. */
  colorToken?: string;
};

export type NavGroup = {
  /** Sin título cuando el grupo se explica solo, como el de arriba. */
  title?: string;
  links: NavLink[];
};

/**
 * La navegación de Vida, en tres grupos.
 *
 * El orden refleja cómo se usa: primero Hoy, que es donde se registra;
 * después los módulos, que es donde se consulta; y al final lo del sistema,
 * que se toca una vez al mes.
 *
 * Las páginas internas de trading van en su propio grupo en lugar de
 * mezclarse con los módulos. Son once, y sueltas ahogaban al resto: la
 * navegación parecía la de una aplicación de trading con seis cosas
 * pegadas, que es justo lo contrario de lo que esto es.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    links: [{ href: "/", label: "Hoy", icon: Home }],
  },
  {
    title: "Módulos",
    links: [
      { href: "/trading", label: "Trading", icon: TrendingUp, colorToken: "--mod-trading" },
      { href: "/sueno", label: "Sueño", icon: Moon, colorToken: "--mod-sleep" },
      { href: "/habitos", label: "Hábitos", icon: CircleCheck, colorToken: "--mod-habits" },
      { href: "/lecturas", label: "Lecturas", icon: BookOpen, colorToken: "--mod-reading" },
      { href: "/tareas", label: "Tareas", icon: ListChecks, colorToken: "--mod-tasks" },
      { href: "/comidas", label: "Comidas", icon: UtensilsCrossed, colorToken: "--mod-meals" },
      { href: "/contenido", label: "Contenido", icon: Clapperboard, colorToken: "--mod-content" },
    ],
  },
  {
    title: "Trading en detalle",
    links: [
      { href: "/trades", label: "Operaciones", icon: ListOrdered },
      { href: "/journal", label: "Diario", icon: BookOpen },
      { href: "/analytics", label: "Análisis", icon: BarChart3 },
      { href: "/behaviour", label: "Comportamiento", icon: Brain },
      { href: "/review", label: "Revisión", icon: CalendarCheck },
      { href: "/risk", label: "Riesgo", icon: Shield },
      { href: "/strategies", label: "Estrategias", icon: Target },
      { href: "/reports", label: "Reportes", icon: FileText },
      { href: "/validation", label: "Validación", icon: ShieldCheck },
      { href: "/reconciliation", label: "Conciliación", icon: Scale },
      { href: "/import", label: "Importar", icon: Upload },
    ],
  },
  {
    title: "Sistema",
    links: [
      { href: "/activity", label: "Actividad", icon: Activity },
      { href: "/settings", label: "Configuración", icon: Settings },
    ],
  },
];

/** Plana, para quien sólo necesita buscar una ruta. */
export const NAV_LINKS: NavLink[] = NAV_GROUPS.flatMap((g) => g.links);
