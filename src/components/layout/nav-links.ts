import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  FileText,
  LayoutDashboard,
  ListOrdered,
  Settings,
  Shield,
  Target,
  Upload,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trades", label: "Operaciones", icon: ListOrdered },
  { href: "/journal", label: "Diario", icon: BookOpen },
  { href: "/strategies", label: "Estrategias", icon: Target },
  { href: "/risk", label: "Riesgo", icon: Shield },
  { href: "/reports", label: "Reportes", icon: FileText },
  { href: "/import", label: "Importar", icon: Upload },
  { href: "/activity", label: "Actividad", icon: Activity },
  { href: "/settings", label: "Configuración", icon: Settings },
];
