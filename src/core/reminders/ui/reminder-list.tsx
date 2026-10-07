"use client";

import { BellRing, MessageCircle, MoreHorizontal, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { restoreAction, trashAction } from "@/core/actions";
import { colorVars } from "@/core/notion-colors";
import { DateTime } from "@/lib/fecha";
import { cn } from "@/lib/utils";

import { setReminderActiveAction } from "../actions";
import type { FireView, NowItem, ReminderView } from "../queries";
import { describeRule, reminderTitle } from "../rule";

import { NowReminderRow } from "./now-row";
import { ReminderSheet, type ReminderTargets } from "./reminder-sheet";

type Pestaña = "HOY" | "PROXIMOS" | "REPITEN" | "HISTORIAL";

const PESTAÑAS: { id: Pestaña; label: string }[] = [
  { id: "HOY", label: "Hoy" },
  { id: "PROXIMOS", label: "Próximos" },
  { id: "REPITEN", label: "Se repiten" },
  { id: "HISTORIAL", label: "Historial" },
];

const RUTA = "/tareas/recordatorios";

/** «hoy 08:00», «mañana 08:00», «jue 9 oct 08:00». */
function cuando(instante: string, tz: string, today: string): string {
  const d = DateTime.fromISO(instante).setZone(tz);
  const dias = Math.round(d.startOf("day").diff(DateTime.fromISO(today, { zone: tz }).startOf("day"), "days").days);
  const dia = dias === 0 ? "hoy" : dias === 1 ? "mañana" : d.toFormat("ccc d LLL").replace(/\./g, "");
  return `${dia} ${d.toFormat("HH:mm")}`;
}

/**
 * Recordatorios: Hoy · Próximos · Se repiten · Historial (7 días).
 *
 * Cada fila dice la regla en palabras, a qué va atado y por dónde suena, con
 * un interruptor para apagarlo sin borrarlo. Borrar lo manda a la papelera con
 * «Deshacer», como todo lo demás.
 */
export function ReminderList({
  reminders,
  fires,
  now,
  tz,
  today,
  targets,
  focusId = null,
  openNew = false,
  newProjectId = null,
}: {
  reminders: ReminderView[];
  fires: FireView[];
  now: NowItem[];
  tz: string;
  today: string;
  targets: ReminderTargets;
  focusId?: string | null;
  openNew?: boolean;
  newProjectId?: string | null;
}) {
  const [pestaña, setPestaña] = useState<Pestaña>(focusId ? "PROXIMOS" : "HOY");
  const [hoja, setHoja] = useState<{ abierta: boolean; editando: ReminderView | null }>({
    abierta: openNew,
    editando: null,
  });

  const proximos = reminders
    .filter((r) => r.active && (r.nextFireAt || r.snoozeUntil))
    .sort((a, b) => Date.parse(proxima(a) ?? "") - Date.parse(proxima(b) ?? ""));
  const repiten = reminders.filter((r) => r.rule.freq !== "UNA_VEZ");
  const porId = new Map(reminders.map((r) => [r.id, r]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Recordatorios" className="flex flex-wrap gap-1">
          {PESTAÑAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestaña(p.id)}
              aria-pressed={pestaña === p.id}
              className={cn(
                "min-h-11 rounded-full px-3 text-sm",
                pestaña === p.id ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
              {p.id === "HOY" && now.length > 0 ? <span className="ml-1 tabular-nums">· {now.length}</span> : null}
            </button>
          ))}
        </nav>
        <Button type="button" className="min-h-11" onClick={() => setHoja({ abierta: true, editando: null })}>
          <Plus aria-hidden /> Recordatorio
        </Button>
      </div>

      {pestaña === "HOY" ? (
        now.length === 0 ? (
          <Vacio texto="Hoy no suena nada." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {now.map((n) => (
              <NowReminderRow key={`${n.reminder.id}|${n.fireAt}|${n.estado}`} item={n} tz={tz} />
            ))}
          </ul>
        )
      ) : null}

      {pestaña === "PROXIMOS" ? (
        proximos.length === 0 ? (
          <Vacio texto="Nada por sonar. Crea uno con «+ Recordatorio» o escribe «recuérdame…» en Hoy." />
        ) : (
          <ul className="flex flex-col gap-2">
            {proximos.map((r) => (
              <Fila
                key={r.id}
                r={r}
                tz={tz}
                today={today}
                resaltar={r.id === focusId}
                onEdit={() => setHoja({ abierta: true, editando: r })}
              />
            ))}
          </ul>
        )
      ) : null}

      {pestaña === "REPITEN" ? (
        repiten.length === 0 ? (
          <Vacio texto="Ninguno se repite todavía." />
        ) : (
          <ul className="flex flex-col gap-2">
            {repiten.map((r) => (
              <Fila
                key={r.id}
                r={r}
                tz={tz}
                today={today}
                resaltar={r.id === focusId}
                onEdit={() => setHoja({ abierta: true, editando: r })}
              />
            ))}
          </ul>
        )
      ) : null}

      {pestaña === "HISTORIAL" ? (
        fires.length === 0 ? (
          <Vacio texto="En los últimos 7 días no sonó nada." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {fires.map((f) => {
              const r = porId.get(f.reminderId);
              if (!r) return null;
              return (
                <li key={`${f.reminderId}|${f.fireAt}`} className="flex items-center gap-2 py-2 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-xs text-muted-foreground">{cuando(f.fireAt, tz, today)}</span>
                  <span className="min-w-0 flex-1 truncate">{reminderTitle(r)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {f.doneAt
                      ? `hecho${f.doneVia === "PUSH" ? " desde el aviso" : f.doneVia === "WHATSAPP" ? " por WhatsApp" : ""}`
                      : f.snoozedTo
                        ? `pospuesto a las ${DateTime.fromISO(f.snoozedTo).setZone(tz).toFormat("HH:mm")}`
                        : f.missed
                          ? "no sonó (el reloj llegó tarde)"
                          : f.pushedAt
                            ? "sonó"
                            : "en la campana"}
                  </span>
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      <ReminderSheet
        open={hoja.abierta}
        onOpenChange={(abierta) => setHoja((h) => ({ ...h, abierta }))}
        tz={tz}
        targets={targets}
        initial={hoja.editando}
        defaultProjectId={hoja.editando ? null : newProjectId}
      />
    </div>
  );
}

function proxima(r: ReminderView): string | null {
  if (r.snoozeUntil && (!r.nextFireAt || Date.parse(r.snoozeUntil) < Date.parse(r.nextFireAt))) return r.snoozeUntil;
  return r.nextFireAt;
}

function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-[14px] border border-dashed border-border p-4 text-sm text-muted-foreground">{texto}</p>;
}

function Fila({
  r,
  tz,
  today,
  resaltar,
  onEdit,
}: {
  r: ReminderView;
  tz: string;
  today: string;
  resaltar: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [activo, setActivo] = useState(r.active);
  const siguiente = proxima(r);

  const cambiar = (v: boolean) =>
    start(async () => {
      setActivo(v);
      const res = await setReminderActiveAction(r.id, v);
      if (!res.ok) {
        setActivo(!v);
        toast.error("No se pudo cambiar.");
        return;
      }
      router.refresh();
    });

  const borrar = () =>
    start(async () => {
      const { trashId } = await trashAction("RECORDATORIO", r.id, RUTA);
      if (!trashId) {
        toast.error("No se pudo borrar.");
        return;
      }
      toast.success("Recordatorio en la papelera.", {
        action: {
          label: "Deshacer",
          onClick: () => {
            void restoreAction(trashId, RUTA).then((ok) => {
              if (ok) {
                toast.success("Recuperado.");
                router.refresh();
              } else toast.error("No se pudo recuperar.");
            });
          },
        },
      });
      router.refresh();
    });

  return (
    <li
      id={`r-${r.id}`}
      className={cn(
        "flex items-start gap-3 rounded-[14px] border border-border bg-card p-3",
        resaltar && "ring-2 ring-primary",
        !activo && "opacity-60",
      )}
    >
      <BellRing className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{reminderTitle(r)}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{describeRule(r.rule, today)}</span>
          {r.entityLabel && r.kind === "TEXTO" ? (
            <span className="rounded-full px-2 py-0.5" style={{ ...colorVars(r.entityColor ?? "default"), backgroundColor: "color-mix(in srgb, var(--tag-color) 14%, transparent)", color: "var(--tag-color)" }}>
              {r.entityLabel}
            </span>
          ) : null}
          <span className="flex items-center gap-1" aria-label={r.channels.map((c) => (c === "PUSH" ? "en el teléfono" : "copia en WhatsApp")).join(" y ")}>
            {r.channels.includes("PUSH") ? <Smartphone className="size-3.5" aria-hidden /> : null}
            {r.channels.includes("WHATSAPP") ? <MessageCircle className="size-3.5" aria-hidden /> : null}
          </span>
          {r.lockPrivate ? <span>oculto en la pantalla bloqueada</span> : null}
        </p>
        {activo && siguiente ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.snoozeUntil === siguiente ? "Pospuesto: vuelve" : "Próxima:"} {cuando(siguiente, tz, today)}
          </p>
        ) : activo ? (
          <p className="mt-0.5 text-xs text-muted-foreground">Ya no vuelve a sonar.</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Switch checked={activo} onCheckedChange={cambiar} disabled={pending} aria-label={activo ? "Apagar" : "Encender"} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="Más acciones">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" aria-hidden /> Cambiar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={borrar} className="text-negative focus:text-negative">
              <Trash2 className="size-4" aria-hidden /> Borrar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
