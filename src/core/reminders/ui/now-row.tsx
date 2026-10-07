"use client";

import { AlarmClock, Check, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DateTime } from "@/lib/fecha";
import { cn } from "@/lib/utils";

import { fireDoneAction, fireSnoozeAction } from "../actions";
import type { NowItem } from "../queries";
import { reminderTitle } from "../rule";

/**
 * Una vez de hoy de un recordatorio, con botones de un toque.
 *
 * - Ya sonó y está sin hacer: «Hecho» y «En 1 h», como en la notificación.
 * - Todavía no ha sonado: «Hecho» (así no suena).
 * - Hecho o pospuesto: lo dice, sin botones.
 */
export function NowReminderRow({ item, tz }: { item: NowItem; tz: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [estado, setEstado] = useState(item.estado);
  const [vuelve, setVuelve] = useState<string | null>(item.snoozedTo);
  const hora = DateTime.fromISO(item.fireAt).setZone(tz).toFormat("HH:mm");
  const titulo = reminderTitle(item.reminder);
  const atado = item.reminder.kind === "TEXTO" ? item.reminder.entityLabel : null;

  const hecho = () =>
    start(async () => {
      const r = await fireDoneAction(item.reminder.id, item.fireAt);
      if (!r.ok) {
        toast.error("No se pudo marcar.");
        return;
      }
      setEstado("HECHO");
      router.refresh();
    });

  const posponer = () =>
    start(async () => {
      const r = await fireSnoozeAction(item.reminder.id, item.fireAt, 60);
      if (!r.ok || !r.until) {
        toast.error("No se pudo posponer.");
        return;
      }
      setEstado("POSPUESTO");
      setVuelve(r.until);
      toast.success(`Vuelve a sonar a las ${DateTime.fromISO(r.until).setZone(tz).toFormat("HH:mm")}.`);
      router.refresh();
    });

  return (
    <li className={cn("flex items-center gap-2 py-1.5 text-sm", estado === "HECHO" && "opacity-60")}>
      <AlarmClock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{hora}</span>
      <span className={cn("min-w-0 flex-1", estado === "HECHO" && "line-through")}>
        <span className="block truncate">{titulo}</span>
        {atado ? <span className="block truncate text-xs text-muted-foreground">{atado}</span> : null}
      </span>
      {estado === "HECHO" ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden /> Hecho
        </span>
      ) : estado === "POSPUESTO" ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {vuelve ? `a las ${DateTime.fromISO(vuelve).setZone(tz).toFormat("HH:mm")}` : "pospuesto"}
        </span>
      ) : (
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={hecho}
            disabled={pending}
            aria-label={`Hecho: ${titulo}`}
            className="min-h-11 rounded-full border border-border px-3 text-xs font-medium hover:border-foreground/30 disabled:opacity-50"
          >
            Hecho
          </button>
          {estado === "SONO" ? (
            <button
              type="button"
              onClick={posponer}
              disabled={pending}
              aria-label={`En una hora: ${titulo}`}
              className="min-h-11 rounded-full border border-border px-3 text-xs hover:border-foreground/30 disabled:opacity-50"
            >
              1 h
            </button>
          ) : null}
        </span>
      )}
    </li>
  );
}
