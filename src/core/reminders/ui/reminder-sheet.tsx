"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { normalizeName } from "@/core/people";
import { DateTime } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import type { ReminderChannel, ReminderFreq, ReminderKind } from "@/types/database";

import { previewReminderAction, saveReminderAction } from "../actions";
import { PARSE_FAILURE_TEXT, parseReminder } from "../parse";
import type { ReminderView } from "../queries";
import {
  FREQ_LABELS,
  REMINDER_TEXT_MAX,
  WEEKDAY_SHORT,
  describeRule,
  isNightTime,
  type ReminderRule,
} from "../rule";

const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const FRECUENCIAS: ReminderFreq[] = ["UNA_VEZ", "DIARIO", "LABORABLES", "SEMANAL", "MENSUAL", "CADA_N_DIAS"];
const TIPOS: { kind: ReminderKind; label: string }[] = [
  { kind: "TEXTO", label: "Texto" },
  { kind: "QUE_FALTA", label: "Qué falta en…" },
  { kind: "COMO_VA", label: "Cómo va…" },
  { kind: "TU_DIA", label: "Tu día" },
];

export interface ReminderTargets {
  projects: { id: string; name: string }[];
  people: { id: string; name: string }[];
}

interface Estado {
  kind: ReminderKind;
  text: string;
  freq: ReminderFreq;
  atTime: string;
  days: number[];
  monthday: number;
  everyN: number;
  onDate: string;
  untilDate: string;
  /** "" | "PROYECTO:<id>" | "PERSONA:<id>" */
  atado: string;
  channels: ReminderChannel[];
  lockPrivate: boolean;
}

function inicial(tz: string, initial: ReminderView | null, projectId: string | null): Estado {
  const hoy = DateTime.now().setZone(tz);
  if (initial) {
    return {
      kind: initial.kind,
      text: initial.text ?? "",
      freq: initial.rule.freq,
      atTime: initial.rule.atTime,
      days: initial.rule.days.length > 0 ? initial.rule.days : [hoy.weekday],
      monthday: initial.rule.monthday ?? hoy.day,
      everyN: initial.rule.everyN ?? 2,
      onDate: initial.rule.onDate ?? hoy.plus({ days: 1 }).toISODate()!,
      untilDate: initial.rule.untilDate ?? "",
      atado: initial.entityKind && initial.entityId ? `${initial.entityKind}:${initial.entityId}` : "",
      channels: initial.channels,
      lockPrivate: initial.lockPrivate,
    };
  }
  return {
    kind: "TEXTO",
    text: "",
    freq: "UNA_VEZ",
    atTime: "09:00",
    days: [hoy.weekday],
    monthday: hoy.day,
    everyN: 2,
    onDate: hoy.plus({ days: 1 }).toISODate()!,
    untilDate: "",
    atado: projectId ? `PROYECTO:${projectId}` : "",
    channels: ["PUSH", "WHATSAPP"],
    lockPrivate: false,
  };
}

function aRegla(e: Estado): ReminderRule {
  return {
    freq: e.freq,
    atTime: e.atTime,
    days: e.freq === "SEMANAL" ? e.days : [],
    monthday: e.freq === "MENSUAL" ? e.monthday : null,
    everyN: e.freq === "CADA_N_DIAS" ? e.everyN : null,
    onDate: e.freq === "UNA_VEZ" || e.freq === "CADA_N_DIAS" ? e.onDate || null : null,
    untilDate: e.freq !== "UNA_VEZ" && e.untilDate ? e.untilDate : null,
  };
}

function aEnvio(e: Estado, id?: string) {
  const regla = aRegla(e);
  const [kindAtado, idAtado] = e.atado ? e.atado.split(":") : [null, null];
  return {
    ...(id ? { id } : {}),
    kind: e.kind,
    text: e.kind === "TEXTO" ? e.text.trim() : "",
    freq: regla.freq,
    atTime: regla.atTime,
    days: regla.days,
    monthday: regla.monthday,
    everyN: regla.everyN,
    onDate: regla.onDate,
    untilDate: regla.untilDate,
    entityKind: (kindAtado as "PROYECTO" | "PERSONA" | null) ?? null,
    entityId: idAtado ?? null,
    channels: e.channels,
    lockPrivate: e.lockPrivate,
    // En el formulario la hora siempre la eliges tú: si cae de noche, suena.
    timeSaid: true,
  };
}

/** Lo que la frase dice, sobre lo que ya había: los campos y «Así lo entendí». */
function desdeFrase(
  texto: string,
  base: Estado,
  tz: string,
  targets: ReminderTargets,
): { estado: Estado; entendido: string | null } {
  if (texto.trim() === "") return { estado: base, entendido: null };
  const r = parseReminder(texto, { now: new Date(), tz });
  if (!r.ok) return { estado: base, entendido: PARSE_FAILURE_TEXT[r.reason] };
  const v = r.value;
  let atado = base.atado;
  if (v.project) {
    const n = normalizeName(v.project);
    const p = targets.projects.find((x) => normalizeName(x.name) === n || normalizeName(x.name).includes(n));
    if (p) atado = `PROYECTO:${p.id}`;
  }
  const hoy = DateTime.now().setZone(tz).toISODate()!;
  return {
    estado: {
      ...base,
      kind: v.kind,
      text: v.kind === "TEXTO" ? v.text : "",
      freq: v.rule.freq,
      atTime: v.rule.atTime,
      days: v.rule.days.length > 0 ? v.rule.days : base.days,
      monthday: v.rule.monthday ?? base.monthday,
      everyN: v.rule.everyN ?? base.everyN,
      onDate: v.rule.onDate ?? base.onDate,
      untilDate: v.rule.untilDate ?? "",
      atado,
    },
    entendido: `Así lo entendí: ${describeRule(v.rule, hoy)}${v.kind === "TEXTO" ? ` · «${v.text}»` : ""}`,
  };
}

/** «mié 8 oct · 08:00», en la zona del recordatorio. */
function vez(instante: string, tz: string): string {
  const d = DateTime.fromISO(instante).setZone(tz);
  return `${d.toFormat("ccc d LLL").replace(/\./g, "")} · ${d.toFormat("HH:mm")}`;
}

/**
 * «+ Recordatorio» (y editar uno): una hoja que sube desde abajo.
 *
 * Arriba, «escríbelo como lo dirías»: el mismo lector que la orden rápida
 * rellena los campos al momento («todos los días a las 8 revisar el precio»).
 * Debajo, los mismos campos a mano, y la vista previa de las cinco próximas
 * veces, que calcula la base con la misma función con la que suena.
 */
export function ReminderSheet({
  open,
  onOpenChange,
  tz,
  targets,
  initial = null,
  defaultProjectId = null,
  initialPhrase = "",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tz: string;
  targets: ReminderTargets;
  initial?: ReminderView | null;
  defaultProjectId?: string | null;
  /** Lo escrito en la orden rápida, para seguir aquí con los campos a mano. */
  initialPhrase?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [estado, setEstado] = useState<Estado>(() => inicial(tz, initial, defaultProjectId));
  const [frase, setFrase] = useState("");
  const [entendido, setEntendido] = useState<string | null>(null);
  const [previa, setPrevia] = useState<{ times: string[]; error?: string } | null>(null);
  const [abiertoAntes, setAbiertoAntes] = useState(open);

  // Al abrir otra vez, empieza de nuevo (o con el que se edita).
  if (open !== abiertoAntes) {
    setAbiertoAntes(open);
    if (open) {
      const r = desdeFrase(initialPhrase, inicial(tz, initial, defaultProjectId), tz, targets);
      setEstado(r.estado);
      setFrase(initialPhrase);
      setEntendido(r.entendido);
      setPrevia(null);
    }
  }

  const cambia = (parche: Partial<Estado>) => setEstado((e) => ({ ...e, ...parche }));

  // Las cinco próximas veces, calculadas por la base. Con un respiro para no
  // preguntar en cada tecla.
  const clave = JSON.stringify(aEnvio(estado));
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    const t = setTimeout(() => {
      void previewReminderAction(JSON.parse(clave)).then((r) => {
        if (vivo) setPrevia(r.ok ? { times: r.times } : { times: [], error: r.error });
      });
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [clave, open]);

  const leerFrase = (texto: string) => {
    setFrase(texto);
    const r = desdeFrase(texto, estado, tz, targets);
    setEstado(r.estado);
    setEntendido(r.entendido);
  };

  const guardar = () =>
    start(async () => {
      const r = await saveReminderAction(aEnvio(estado, initial?.id));
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar.");
        return;
      }
      toast.success(
        r.nextFireAt ? `Listo. Suena ${vez(r.nextFireAt, tz)}.` : "Guardado. Con esa regla no vuelve a sonar.",
      );
      onOpenChange(false);
      onSaved?.();
      router.refresh();
    });

  const necesitaProyecto = estado.kind === "QUE_FALTA" || estado.kind === "COMO_VA";
  const noche = isNightTime(estado.atTime);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="inset-x-0 bottom-0 max-h-[92svh] w-full overflow-y-auto rounded-t-[14px] border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-xl"
      >
        <SheetTitle className="text-base">{initial ? "Cambiar recordatorio" : "Nuevo recordatorio"}</SheetTitle>

        {!initial ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Escríbelo como lo dirías (también se puede dictar)</span>
            <Input
              value={frase}
              onChange={(e) => leerFrase(e.target.value)}
              placeholder="todos los días a las 8 revisar el precio del crudo"
              className="h-11"
              autoComplete="off"
            />
            {entendido ? (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {entendido}
              </span>
            ) : null}
          </label>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">Qué</legend>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => (
              <Chip key={t.kind} on={estado.kind === t.kind} onClick={() => cambia({ kind: t.kind })}>
                {t.label}
              </Chip>
            ))}
          </div>
          {estado.kind === "TEXTO" ? (
            <Input
              value={estado.text}
              onChange={(e) => cambia({ text: e.target.value })}
              maxLength={REMINDER_TEXT_MAX}
              placeholder="Revisar el precio del crudo"
              aria-label="Qué te recuerdo"
              className="h-11"
            />
          ) : estado.kind === "TU_DIA" ? (
            <p className="text-xs text-muted-foreground">
              Lo de hoy, lo atrasado, lo que va a sonar y los proyectos que piden atención, armado al sonar.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Se arma al sonar, con los datos de ese momento.</p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">Cuándo</legend>
          <div className="flex flex-wrap gap-1.5">
            {FRECUENCIAS.map((f) => (
              <Chip key={f} on={estado.freq === f} onClick={() => cambia({ freq: f })}>
                {FREQ_LABELS[f]}
              </Chip>
            ))}
          </div>

          {estado.freq === "SEMANAL" ? (
            <div role="group" aria-label="Días de la semana" className="flex gap-1">
              {WEEKDAY_SHORT.map((letra, i) => {
                const d = i + 1;
                const on = estado.days.includes(d);
                return (
                  <button
                    key={letra}
                    type="button"
                    aria-pressed={on}
                    aria-label={DIAS_LARGOS[i]}
                    onClick={() =>
                      cambia({ days: on ? estado.days.filter((x) => x !== d) : [...estado.days, d].sort((a, b) => a - b) })
                    }
                    className={cn(
                      "size-11 rounded-full border text-sm",
                      on ? "border-primary bg-accent font-medium text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    {letra}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Hora</span>
              <Input type="time" value={estado.atTime} onChange={(e) => cambia({ atTime: e.target.value.slice(0, 5) })} className="h-11" />
            </label>

            {estado.freq === "UNA_VEZ" || estado.freq === "CADA_N_DIAS" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">{estado.freq === "UNA_VEZ" ? "Día" : "Desde"}</span>
                <Input type="date" value={estado.onDate} onChange={(e) => cambia({ onDate: e.target.value })} className="h-11" />
              </label>
            ) : null}

            {estado.freq === "MENSUAL" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">Día del mes</span>
                <select
                  value={estado.monthday}
                  onChange={(e) => cambia({ monthday: Number(e.target.value) })}
                  className="h-11 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      El {n}
                    </option>
                  ))}
                  <option value={-1}>El último</option>
                </select>
              </label>
            ) : null}

            {estado.freq === "CADA_N_DIAS" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">Cada cuántos días</span>
                <Input
                  type="number"
                  min={2}
                  max={365}
                  value={estado.everyN}
                  onChange={(e) => cambia({ everyN: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
                  className="h-11"
                />
              </label>
            ) : null}

            {estado.freq !== "UNA_VEZ" ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">Hasta (opcional)</span>
                <Input type="date" value={estado.untilDate} onChange={(e) => cambia({ untilDate: e.target.value })} className="h-11" />
              </label>
            ) : null}
          </div>
          {noche ? (
            <p className="text-xs text-muted-foreground">
              Es de noche: suena igual, porque la hora la pusiste tú. Lo que se pospone a la noche espera a las 07:00.
            </p>
          ) : null}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">{necesitaProyecto ? "De qué proyecto" : "A qué va atado (opcional)"}</span>
          <select
            value={estado.atado}
            onChange={(e) => cambia({ atado: e.target.value })}
            className="h-11 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
          >
            {!necesitaProyecto ? <option value="">A nada</option> : <option value="">Elige un proyecto</option>}
            {targets.projects.length > 0 ? (
              <optgroup label="Proyectos">
                {targets.projects.map((p) => (
                  <option key={p.id} value={`PROYECTO:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {!necesitaProyecto && targets.people.length > 0 ? (
              <optgroup label="Personas">
                {targets.people.map((p) => (
                  <option key={p.id} value={`PERSONA:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>

        <div className="flex flex-col gap-2 text-sm">
          <Fila
            label="Que suene en el teléfono"
            on={estado.channels.includes("PUSH")}
            onChange={(v) =>
              cambia({ channels: v ? [...new Set<ReminderChannel>([...estado.channels, "PUSH"])] : estado.channels.filter((c) => c !== "PUSH") })
            }
          />
          <Fila
            label="Copia en «🤖 Mi bot» (cuando tu Mac esté despierta)"
            on={estado.channels.includes("WHATSAPP")}
            onChange={(v) =>
              cambia({
                channels: v
                  ? [...new Set<ReminderChannel>([...estado.channels, "WHATSAPP"])]
                  : estado.channels.filter((c) => c !== "WHATSAPP"),
              })
            }
          />
          <Fila
            label="Ocultar el texto en la pantalla bloqueada"
            on={estado.lockPrivate}
            onChange={(v) => cambia({ lockPrivate: v })}
          />
          {estado.channels.length === 0 ? (
            <p className="text-xs text-negative">Elige al menos dónde suena.</p>
          ) : null}
        </div>

        <section aria-live="polite" className="rounded-[14px] border border-border p-3 text-sm">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sonará</h3>
          {previa === null ? (
            <p className="text-xs text-muted-foreground">Calculando…</p>
          ) : previa.error ? (
            <p className="text-xs text-muted-foreground">{previa.error}</p>
          ) : previa.times.length === 0 ? (
            <p className="text-xs text-warning">Con esta regla no vuelve a sonar (¿la hora ya pasó?).</p>
          ) : (
            <ul className="flex flex-col gap-0.5 tabular-nums">
              {previa.times.map((t) => (
                <li key={t}>{vez(t, tz)}</li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex gap-2">
          <Button type="button" onClick={guardar} disabled={pending || estado.channels.length === 0} className="min-h-11 flex-1">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Guardar
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="min-h-11">
            Cancelar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-3 text-sm",
        on ? "border-primary bg-accent font-medium text-primary" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Fila({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span>{label}</span>
      <Switch checked={on} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
