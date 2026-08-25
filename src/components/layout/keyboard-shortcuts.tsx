"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Los ocho módulos, no sólo trading.
 *
 * Los atajos cubrían ocho destinos y siete eran de trading: quien lleva sueño,
 * hábitos, tareas, comidas, lecturas y contenido a diario navegaba a ratón por
 * seis módulos mientras el séptimo tenía teclado. Un atajo que sólo sirve para
 * una parte de la aplicación es una función de esa parte, no de la aplicación.
 *
 * Las letras siguen a la palabra en castellano cuando se puede (s de sueño,
 * h de hábitos, t de tareas), y donde chocan gana lo que más se usa.
 */
const SHORTCUTS: { keys: string; label: string; href?: string }[] = [
  { keys: "g i", label: "Ir a Hoy", href: "/" },
  { keys: "g d", label: "Ir al día de hoy", href: "/dia" },
  // Trading
  { keys: "g p", label: "Ir al panel de trading", href: "/trading" },
  { keys: "g o", label: "Ir a operaciones", href: "/trades" },
  { keys: "g j", label: "Ir al diario", href: "/journal" },
  { keys: "g a", label: "Ir a análisis", href: "/analytics" },
  { keys: "g c", label: "Ir a comportamiento", href: "/behaviour" },
  { keys: "g r", label: "Ir a la revisión semanal", href: "/review" },
  // Vida
  { keys: "g s", label: "Ir a sueño", href: "/sueno" },
  { keys: "g b", label: "Ir a hábitos", href: "/habitos" },
  { keys: "g t", label: "Ir a tareas", href: "/tareas" },
  { keys: "g m", label: "Ir a comidas", href: "/comidas" },
  { keys: "g l", label: "Ir a lecturas", href: "/lecturas" },
  { keys: "g n", label: "Ir a contenido", href: "/contenido" },
  // Sistema
  { keys: "g v", label: "Ir a actividad", href: "/activity" },
  { keys: "g ,", label: "Ir a configuración", href: "/settings" },
  { keys: "⌘ K", label: "Buscar en todo" },
  { keys: "/", label: "Buscar en la página" },
  { keys: "?", label: "Mostrar estos atajos" },
];

/**
 * Keyboard navigation, in the "g then letter" style most tools use.
 *
 * Mounted once in the dashboard layout. Deliberately ignores every
 * keystroke aimed at a text field -- a shortcut that fires while you're
 * typing a journal entry is worse than no shortcut at all.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let awaitingSecondKey = false;
    let resetTimer: ReturnType<typeof setTimeout> | undefined;

    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      // Never hijack a browser or OS shortcut.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "?") {
        event.preventDefault();
        setShowHelp((v) => !v);
        return;
      }

      if (event.key === "Escape") {
        setShowHelp(false);
        return;
      }

      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="Buscar"]');
        if (search) {
          event.preventDefault();
          search.focus();
        }
        return;
      }

      if (awaitingSecondKey) {
        const match = SHORTCUTS.find((s) => s.href && s.keys === `g ${event.key.toLowerCase()}`);
        awaitingSecondKey = false;
        if (resetTimer) clearTimeout(resetTimer);
        if (match?.href) {
          event.preventDefault();
          router.push(match.href);
        }
        return;
      }

      if (event.key.toLowerCase() === "g") {
        awaitingSecondKey = true;
        // The prefix expires, so a stray "g" doesn't swallow the next
        // keystroke minutes later.
        resetTimer = setTimeout(() => {
          awaitingSecondKey = false;
        }, 1500);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [router]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      role="dialog"
      aria-label="Atajos de teclado"
      onClick={() => setShowHelp(false)}
    >
      <Card className="max-h-[80vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="flex flex-col gap-2 pt-5">
          <p className="font-medium">Atajos de teclado</p>
          <ul className="flex flex-col divide-y divide-border text-sm">
            {SHORTCUTS.map((s) => (
              <li key={s.keys} className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-muted-foreground">{s.label}</span>
                <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-xs">
                  {s.keys}
                </kbd>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Esc para cerrar.</p>
        </CardContent>
      </Card>
    </div>
  );
}
