"use client";

import { Check, Loader2, MoonStar, Sunrise } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChipGroup } from "@/core/ui/chip-group";
import { IconPicker } from "@/core/ui/icon-picker";
import { cn } from "@/lib/utils";
import { saveMorningHalf, saveNightHalf, type SleepFormState } from "@/modules/sleep/actions";
import {
  BEFORE_BED,
  MOOD_ON_WAKING,
  WOKE_HOW,
  clockFromTimestamp,
  formatSleepDuration,
} from "@/modules/sleep/domain/sleep";
import type { SleepEntryRow } from "@/modules/sleep/queries";

const initialState: SleepFormState = { error: null, success: false };

/** Las horas a las que uno se acuesta y se levanta de verdad, para no teclear. */
const BEDTIME_SHORTCUTS = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "01:00", "02:00"];
const WAKE_SHORTCUTS = ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "09:00"];

/** Las opciones de «Cuanto tiempo Dormí?», tal cual están en tu Notion. */
const SELF_REPORTED = [
  "4 horas",
  "5 horas",
  "6 horas",
  "7 horas",
  "8 horas",
  "9 horas",
  "10 horas",
  "Más de 10",
];

/**
 * Registrar una noche, en las dos veces que se registra de verdad.
 *
 * Una noche no se apunta de una sentada: la mitad de arriba se rellena antes
 * de acostarse y la de abajo al levantarse, con horas de sueño de por medio.
 * El formulario anterior era un asistente de seis pasos con un solo botón de
 * guardar, y eso rompía justo ese uso -- cada guardado pisaba con nulos lo que
 * la otra mitad había dejado escrito, así que una noche rellenada dos veces
 * acababa vacía.
 *
 * Ahora son dos formularios de verdad, cada uno con su botón, y cada uno
 * escribe sólo sus columnas. Guardar la mitad de la mañana no puede borrar la
 * de la noche ni aunque quisiera: sus campos ni siquiera viajan.
 *
 * Se conservan las dos cosas que hacían usable el asistente a las siete de la
 * mañana: los atajos de hora -- tocar «23:00» es una acción, escribirlo en el
 * campo de hora del móvil son cuatro -- y la duración grande y en vivo.
 */
export function SleepWizard({
  date,
  entry,
  timezone,
}: {
  date: string;
  entry: SleepEntryRow | null;
  timezone: string;
}) {
  const [bedtime, setBedtime] = useState(clockFromTimestamp(entry?.slept_at ?? null, timezone));
  const [wakeTime, setWakeTime] = useState(clockFromTimestamp(entry?.woke_at ?? null, timezone));

  const duration = durationBetween(bedtime, wakeTime);

  // Que una mitad esté guardada se mira por sus propios campos: la noche puede
  // tener hora sin etiquetas y al revés.
  const nightSaved = entry !== null && (entry.slept_at !== null || entry.before_bed.length > 0);
  const morningSaved =
    entry !== null &&
    (entry.woke_at !== null ||
      entry.score !== null ||
      entry.woke_how.length > 0 ||
      entry.mood_on_waking.length > 0 ||
      entry.dream !== null);

  return (
    <div className="flex flex-col gap-6">
      <p
        className="text-center text-4xl font-semibold tabular-nums"
        style={{ color: duration === null ? "var(--muted-foreground)" : "var(--mod-sleep)" }}
        aria-live="polite"
      >
        {duration === null ? "--" : formatSleepDuration(duration)}
      </p>
      <p className="-mt-4 text-center text-sm text-muted-foreground">
        {duration === null
          ? "Con las dos horas sale la duración, incluso cruzando la medianoche."
          : "Dormidas esta noche"}
      </p>

      <NightHalf
        date={date}
        entry={entry}
        bedtime={bedtime}
        onBedtime={setBedtime}
        saved={nightSaved}
      />

      <MorningHalf
        date={date}
        entry={entry}
        wakeTime={wakeTime}
        onWakeTime={setWakeTime}
        saved={morningSaved}
      />
    </div>
  );
}

// ------------------------------------------------------------ antes de dormir

function NightHalf({
  date,
  entry,
  bedtime,
  onBedtime,
  saved,
}: {
  date: string;
  entry: SleepEntryRow | null;
  bedtime: string;
  onBedtime: (value: string) => void;
  saved: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveNightHalf, initialState);

  useEffect(() => {
    if (state.success) toast.success("Guardado. Que descanses.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-lg border border-border p-4">
      <input type="hidden" name="sleep_date" value={date} />

      <Header icon={MoonStar} title="Antes de dormir" saved={saved} />

      <TimeQuestion
        id="bedtime"
        name="bedtime"
        label="Me acuesto a las"
        value={bedtime}
        onChange={onBedtime}
        shortcuts={BEDTIME_SHORTCUTS}
      />

      <Field label="¿Qué hiciste antes de dormir?">
        <ChipGroup
          name="before_bed"
          options={BEFORE_BED}
          defaultValue={entry?.before_bed ?? []}
          accent="--mod-sleep"
        />
      </Field>

      <Field label="Dónde duermo">
        <Input name="place" defaultValue={entry?.place ?? ""} autoComplete="off" />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Guardar antes de dormir
        </Button>
      </div>
    </form>
  );
}

// --------------------------------------------------------------- al despertar

function MorningHalf({
  date,
  entry,
  wakeTime,
  onWakeTime,
  saved,
}: {
  date: string;
  entry: SleepEntryRow | null;
  wakeTime: string;
  onWakeTime: (value: string) => void;
  saved: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveMorningHalf, initialState);
  const [score, setScore] = useState<number | null>(entry?.score ?? null);
  const [selfReported, setSelfReported] = useState(entry?.self_reported ?? "");

  useEffect(() => {
    if (state.success) toast.success("Noche guardada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-lg border border-border p-4">
      <input type="hidden" name="sleep_date" value={date} />

      <Header icon={Sunrise} title="Al despertar" saved={saved} />

      <TimeQuestion
        id="wake_time"
        name="wake_time"
        label="Me levanté a las"
        value={wakeTime}
        onChange={onWakeTime}
        shortcuts={WAKE_SHORTCUTS}
      />

      <Field label="¿Cómo despertaste?">
        <ChipGroup
          name="woke_how"
          options={WOKE_HOW}
          defaultValue={entry?.woke_how ?? []}
          accent="--mod-sleep"
        />
      </Field>

      <Field label="¿Con qué ánimo te levantaste?">
        <ChipGroup
          name="mood_on_waking"
          options={MOOD_ON_WAKING}
          defaultValue={entry?.mood_on_waking ?? []}
          accent="--mod-sleep"
        />
      </Field>

      <Field label="¿Qué tal la noche?">
        <ScoreQuestion value={score} onChange={setScore} />
        {/* El puntaje viaja aparte porque la fila de botones no es un campo. */}
        <input type="hidden" name="score" value={score ?? ""} />
      </Field>

      <Field label="¿Cuánto crees que dormiste?">
        {/*
          «Cuanto tiempo Dormí?» de tu Notion. No es la resta de las dos horas
          y por eso vale: la diferencia entre lo que crees y lo que dice el
          reloj es un dato por sí misma.
        */}
        <div className="flex flex-wrap gap-1.5">
          {SELF_REPORTED.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelfReported((current) => (current === option ? "" : option))}
              aria-pressed={selfReported === option}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                selfReported === option
                  ? "border-primary bg-accent font-medium text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <input type="hidden" name="self_reported" value={selfReported} />
      </Field>

      <Field label="¿Qué soñaste?">
        <Textarea
          id="dream"
          name="dream"
          rows={6}
          placeholder="Lo que recuerdes, aunque sean fragmentos sueltos. Esto es lo que se relee meses después."
          defaultValue={entry?.dream ?? ""}
        />
      </Field>

      <Field label="Notas">
        <Input name="notes" defaultValue={entry?.notes ?? ""} autoComplete="off" />
      </Field>

      <IconPicker name="icon" defaultValue={entry?.icon} />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          Guardar al despertar
        </Button>
      </div>
    </form>
  );
}

// --------------------------------------------------------------------- piezas

function Header({
  icon: Icon,
  title,
  saved,
}: {
  icon: typeof MoonStar;
  title: string;
  saved: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-5" style={{ color: "var(--mod-sleep)" }} aria-hidden />
      <h2 className="text-lg font-medium">{title}</h2>
      {saved ? (
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
          Guardado
        </span>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function TimeQuestion({
  id,
  name,
  label,
  value,
  onChange,
  shortcuts,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  shortcuts: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-40 text-lg tabular-nums"
      />
      <div className="flex flex-wrap gap-1.5">
        {shortcuts.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors",
              value === option
                ? "border-primary bg-accent font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreQuestion({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: 11 }, (_, index) => index).map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(on ? null : option)}
            aria-pressed={on}
            className={cn(
              "size-9 rounded-full border text-sm tabular-nums transition-colors",
              on
                ? "border-transparent font-medium text-background"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
            style={on ? { backgroundColor: "var(--mod-sleep)" } : undefined}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * La duración en vivo, sólo para la pantalla.
 *
 * Repite la regla del servidor -- cruzar la medianoche suma un día -- porque
 * pedirla al servidor por cada tecla sería una llamada por dígito. Lo que se
 * archiva siempre lo calcula Postgres a partir de los dos instantes.
 */
function durationBetween(bedtime: string, wakeTime: string): number | null {
  if (!bedtime || !wakeTime) return null;

  const [bedHour, bedMinute] = bedtime.split(":").map(Number);
  const [wakeHour, wakeMinute] = wakeTime.split(":").map(Number);
  if ([bedHour, bedMinute, wakeHour, wakeMinute].some(Number.isNaN)) return null;

  const bed = bedHour * 60 + bedMinute;
  const wake = wakeHour * 60 + wakeMinute;
  return wake > bed ? wake - bed : wake + 1440 - bed;
}
