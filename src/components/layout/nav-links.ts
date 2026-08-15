import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  FileText,
  LayoutDashboard,
  ListOrdered,
  Settings,
  Shield,
  ShieldCheck,
  Scale,
  Target,
  Upload,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Pages that exist as routes but are still placeholders. They stay
   * reachable (so the roadmap is visible) but are visually separated and
   * labelled, instead of sitting in the main list looking like working
   * features and rewarding a click with "coming in phase 5".
   */
  comingSoon?: boolean;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Operaciones", icon: ListOrdered },
  { href: "/journal", label: "Diario", icon: BookOpen },
  { href: "/analytics", label: "Análisis", icon: BarChart3 },
  { href: "/risk", label: "Riesgo", icon: Shield },
  { href: "/strategies", label: "Estrategias", icon: Target },
  { href: "/reports", label: "Reportes", icon: FileText },
  { href: "/validation", label: "Validación", icon: ShieldCheck },
  { href: "/reconciliation", label: "Conciliación", icon: Scale },
  { href: "/import", label: "Importar", icon: Upload },
  { href: "/activity", label: "Actividad", icon: Activity },
  { href: "/settings", label: "Configuración", icon: Settings },
];
