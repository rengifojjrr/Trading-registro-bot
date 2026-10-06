"use client";

import { AudioLines, Bot, FileText, MessageCircle, Mic, NotebookPen, PenLine, Phone, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { OriginKey } from "@/modules/tasks/domain/projects";

const ICONOS: Record<OriginKey, LucideIcon> = {
  LLAMADA: Phone,
  REUNION: Mic,
  MENSAJE: MessageCircle,
  DICTADO: AudioLines,
  DOCUMENTO: FileText,
  A_MANO: PenLine,
  CLAUDE: Sparkles,
  BOT: Bot,
  NOTION: NotebookPen,
};

/**
 * De dónde salió una tarea: un icono gris pequeño que, al tocarlo, lo dice.
 *
 * La frase sale en una burbuja flotante, encima de la fila y no dentro: metida
 * en la misma fila aplastaba el título a una palabra por línea en el teléfono.
 * Se cierra al tocar fuera, con Escape o tocando otra vez el icono.
 *
 * La evidencia (el mensaje, el audio) nunca está aquí: vive en la Mac. Aquí
 * sólo se dice qué fue.
 */
export function OriginIcon({ origin, text }: { origin: OriginKey; text: string }) {
  const [open, setOpen] = useState(false);
  const caja = useRef<HTMLSpanElement>(null);
  const id = useId();
  const Icono = ICONOS[origin];

  useEffect(() => {
    if (!open) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setOpen(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);

  return (
    <span ref={caja} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        aria-label={text}
        title={text}
        className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <Icono className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute right-0 top-full z-30 mt-1 w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
