import { BookOpen, CircleCheck, Moon, TrendingUp, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * Registro rápido.
 *
 * Lo que se usa a diario no es consultar sino apuntar, así que va antes que
 * cualquier cifra. Son enlaces normales y no un formulario: cada módulo sabe
 * pedir lo suyo, y meter cinco formularios distintos aquí duplicaría la
 * validación de todos ellos en la pantalla que menos puede permitirse fallar.
 */
const ACTIONS: { href: string; label: string; icon: LucideIcon; colorToken: string }[] = [
  // Trading va primero y no estaba.
  //
  // El registro rápido tenía cuatro botones -- dormí, leí, comí, hábitos -- y
  // ninguno para el módulo que más se usa. Lleva al Diario y no a Operaciones
  // a propósito: las operaciones las registra la sincronización sola, lo que
  // hace falta poner a mano es lo que pensabas, y eso está en la bandeja.
  { href: "/journal", label: "Operé", icon: TrendingUp, colorToken: "--mod-trading" },
  { href: "/sueno", label: "Dormí", icon: Moon, colorToken: "--mod-sleep" },
  { href: "/lecturas", label: "Leí", icon: BookOpen, colorToken: "--mod-reading" },
  { href: "/comidas", label: "Comí", icon: UtensilsCrossed, colorToken: "--mod-meals" },
  { href: "/habitos", label: "Hábitos", icon: CircleCheck, colorToken: "--mod-habits" },
];

export function QuickLog() {
  return (
    <div className="flex flex-wrap gap-3">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className="flex min-w-20 flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-3 py-4 transition-colors hover:border-foreground/25 sm:flex-none sm:px-6"
          >
            <Icon className="size-5" style={{ color: `var(${action.colorToken})` }} aria-hidden />
            <span className="text-sm font-medium">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
