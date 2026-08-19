"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChipGroup } from "@/core/ui/chip-group";
import { cn } from "@/lib/utils";
import { saveSleepEntry, type SleepFormState } from "@/modules/sleep/actions";
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

/**
 * Registrar una noche, una pregunta a la vez.
 *
 * El formulario anterior enseñaba las siete preguntas juntas y se leía como
 * un trámite; hay que rellenarlo medio dormido, y a esa hora una pantalla con
 * siete campos se cierra sin rellenar ninguno.
 *
 * Tres decisiones sostienen esto:
 *
 * 1. **Todos los campos están montados siempre**, sólo ocultos. Avanzar y
 *    retroceder no pierde nada, y al enviar va todo -- incluidas las
 *    preguntas que ni se llegaron a ver.
 *
 * 2. **Se puede guardar desde el primer paso.** Sólo las dos horas ya dan una
 *    duración, que es el dato que se viene a apuntar; lo demás es de propina.
 *    Obligar a pasar por seis pantallas para guardar dos horas convertiría el
 *    asistente en un peaje.
 *
 * 3. **Atajos en lugar de teclado.** A las siete de la mañana tocar «23:00»
 *    es una acción; escribirlo en un campo de hora del móvil son cuatro.
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
  const [state, formAction, pending] = useActionState(saveSleepEntry, initialState);
  const [step, setStep] = useState(0);

  const [bedtime, setBedtime] = useState(clockFromTimestamp(entry?.slept_at ?? null, timezone));
  const [wakeTime, setWakeTime] = useState(clockFromTimestamp(entry?.woke_at ?? null, timezone));
  const [score, setScore] = useState<number | null>(entry?.score ?? null);

  useEffect(() => {
    if (state.success) toast.success("Noche guardada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  const duration = durationBetween(bedtime, wakeTime);
  const last = STEPS.length - 1;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="sleep_date" value={date} />

      <Progress step={step} total={STEPS.length} onJump={setStep} />

      {/* Los pasos ocultos siguen enviando su valor: `hidden` no desactiva un
          campo, sólo lo saca de la vista. */}
      <Step active={step === 0} question="¿A qué hora te acostaste y a qué hora te levantaste?">
        <div className="grid gap-6 sm:grid-cols-2">
          <TimeQuestion
            id="bedtime"
            name="bedtime"
            label="Me acosté"
            value={bedtime}
            onChange={setBedtime}
            shortcuts={BEDTIME_SHORTCUTS}
          />
          <TimeQuestion
            id="wake_time"
            name="wake_time"
            label="Me levanté"
            value={wakeTime}
            onChange={setWakeTime}
            shortcuts={WAKE_SHORTCUTS}
          />
        </div>

        <p
          className="mt-6 text-center text-4xl font-semibold tabular-nums"
          style={{ color: duration === null ? "var(--muted-foreground)" : "var(--mod-sleep)" }}
          aria-live="polite"
        >
          {duration === null ? "--" : formatSleepDuration(duration)}
        </p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {duration === null
            ? "Con las dos horas sale la duración, incluso cruzando la medianoche."
            : "Dormidas esta noche"}
        </p>
      </Step>

      <Step active={step === 1} question="¿Qué tal la noche?">
        <ScoreQuestion value={score} onChange={setScore} />
      </Step>

      <Step active={step === 2} question="¿Qué hiciste antes de dormir?">
        <ChipGroup
          name="before_bed"
          options={BEFORE_BED}
          defaultValue={entry?.before_bed ?? []}
          accent="--mod-sleep"
        />
      </Step>

      <Step active={step === 3} question="¿Cómo despertaste?">
        <ChipGroup
          name="woke_how"
          options={WOKE_HOW}
          defaultValue={entry?.woke_how ?? []}
          accent="--mod-sleep"
        />
      </Step>

      <Step active={step === 4} question="¿Con qué ánimo te levantaste?">
        <ChipGroup
          name="mood_on_waking"
          options={MOOD_ON_WAKING}
          defaultValue={entry?.mood_on_waking ?? []}
          accent="--mod-sleep"
        />
      </Step>

      <Step active={step === 5} question="¿Qué soñaste?">
        <Textarea
          id="dream"
          name="dream"
          rows={7}
          placeholder="Lo que recuerdes, aunque sean fragmentos sueltos. Esto es lo que se relee meses después."
          defaultValue={entry?.dream ?? ""}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Dónde dormí</span>
            <Input name="place" defaultValue={entry?.place ?? ""} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Notas</span>
            <Input name="notes" defaultValue={entry?.notes ?? ""} autoComplete="off" />
          </label>
        </div>
      </Step>

      {/* El puntaje viaja aparte porque la fila de botones no es un campo. */}
      <input type="hidden" name="score" value={score ?? ""} />

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft />
          Atrás
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button type="submit" variant={step === last ? "default" : "outline"} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            {entry ? "Guardar cambios" : "Guardar la noche"}
          </Button>

          {step < last ? (
            <Button type="button" onClick={() => setStep((s) => Math.min(last, s + 1))}>
              Siguiente
              <ArrowRight />
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

const STEPS = ["Horas", "Puntaje", "Antes", "Despertar", "Ánimo", "Sueño"];

function Progress({
  step,
  total,
  onJump,
}: {
  step: number;
  total: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEPS.slice(0, total).map((label, index) => (
        <button
          key={label}
          type="button"
          onClick={() => onJump(index)}
          aria-current={index === step ? "step" : undefined}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            index === step
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
          style={index === step ? { boxShadow: "inset 0 -2px 0 var(--mod-sleep)" } : undefined}
        >
          {label}
        </button>
      ))}
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
        {step + 1} de {total}
      </span>
    </div>
  );
}

function Step({
  active,
  question,
  children,
}: {
  active: boolean;
  question: string;
  children: React.ReactNode;
}) {
  return (
    <div hidden={!active} className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-foreground">{question}</h2>
      <div>{children}</div>
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
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-lg tabular-nums"
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

/**
 * El puntaje, como once botones en lugar de un campo numérico.
 *
 * Un `<input type="number">` para elegir entre once valores conocidos obliga a
 * abrir el teclado; una fila de botones se responde con un dedo. Se puede
 * volver a pulsar el mismo número para dejarlo en blanco: no puntuar es una
 * respuesta válida, y sin eso un toque accidental no tiene marcha atrás.
 */
function ScoreQuestion({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => n).map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              aria-label={`${n} de 10`}
              onClick={() => onChange(on ? null : n)}
              className={cn(
                "size-10 rounded-lg border text-sm font-medium tabular-nums transition-colors",
                on
                  ? "border-transparent text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
              style={on ? { background: "var(--mod-sleep)" } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        {value === null
          ? "0 es la peor noche que recuerdas; 10, la mejor. Puedes dejarlo en blanco."
          : "Vuelve a tocar el número para dejarlo en blanco."}
      </p>
    </div>
  );
}

/**
 * La duración mientras se teclea, en minutos.
 *
 * Repite la regla de `resolveSleepTimestamps` -- levantarse antes que
 * acostarse significa que amaneció -- pero sobre dos relojes sueltos, sin
 * zona horaria ni fecha, porque aquí sólo hay que enseñar un número que
 * cambia. El valor que se guarda lo sigue calculando Postgres a partir de las
 * marcas de tiempo reales; esto es un adelanto, no la cuenta buena.
 */
function durationBetween(bedtime: string, wakeTime: string): number | null {
  const bed = toMinutes(bedtime);
  const wake = toMinutes(wakeTime);
  if (bed === null || wake === null) return null;
  return wake > bed ? wake - bed : wake + 24 * 60 - bed;
}

function toMinutes(clock: string): number | null {
  const match = clock.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
