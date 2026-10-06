"use client";

import { AudioLines, Bot, FileText, MessageCircle, Mic, NotebookPen, PenLine, Phone, Sparkles, type LucideIcon } from "lucide-react";
import { useState } from "react";

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
 * La evidencia (el mensaje, el audio) nunca está aquí: vive en la Mac. Aquí
 * sólo se dice qué fue.
 */
export function OriginIcon({ origin, text }: { origin: OriginKey; text: string }) {
  const [open, setOpen] = useState(false);
  const Icono = ICONOS[origin];
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={text}
        title={text}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <Icono className="size-3.5" aria-hidden />
      </button>
      {open ? <span className="text-xs text-muted-foreground">{text}</span> : null}
    </span>
  );
}
