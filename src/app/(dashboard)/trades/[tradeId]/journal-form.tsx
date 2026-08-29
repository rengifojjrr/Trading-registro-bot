"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { UnsavedGuard } from "@/components/shared/unsaved-guard";
import { TemplatePicker } from "@/components/journal/template-picker";
import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RiskReading } from "@/components/trades/risk-reading";
import { PlannedPriceField } from "@/components/trades/planned-price-field";
import {
  HTF_BIAS_OPTIONS,
  RATING_OPTIONS,
  SR_PROXIMITY_OPTIONS,
} from "@/lib/journal/options";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

import { saveJournalEntry, type JournalFormState } from "./actions";

type JournalEntryRow = Database["public"]["Tables"]["journal_entries"]["Row"];

const initialState: JournalFormState = { error: null, success: false };

// Mirrors the option lists actually configured on the original Notion
// "Emociones"/"Errores" multi-select properties (see docs/NOTION_IMPORT.md)
// so this form uses the same vocabulary the historical data was written in.
const EMOTION_OPTIONS = ["Calma", "Ansiedad", "Confianza", "Miedo", "Euforia", "Frustración", "FOMO"];
const MISTAKE_OPTIONS = [
  "Overtrading",
  "Entrada temprana",
  "Falta de plan",
  "Gestión de riesgo",
  "Entrada tardía",
  "Salida temprana",
  "No respetar stop",
  "Sobre apalancamiento",
  "Dirección incorrecta",
  "No leer el mercado",
  "Liquidado",
  "Martingala",
  "FOMO",
  "Dormido",
  "ninguno",
];
const SETUP_GRADES = ["A+", "A", "B", "C"];

function splitList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function JournalForm({
  tradeId,
  journalEntry,
  strategies,
  currentSetupGrade,
  entryPrice,
  direction,
  accountSize,
  maxRiskPct,
  netPnl,
  size,
  contractSize,
}: {
  tradeId: string;
  journalEntry: JournalEntryRow | null;
  strategies: { id: string; name: string }[];
  currentSetupGrade: string | null;
  /** Lets the stop/target be typed as a percentage of what was actually paid. */
  entryPrice: string | null;
  direction: "LONG" | "SHORT";
  /** De Configuración: sin esto el riesgo no se puede poner en porcentaje. */
  accountSize: number | null;
  maxRiskPct: number | null;
  /** El resultado neto, si la operación ya cerró: da las erres. */
  netPnl: number | null;
  /**
   * Con el tamaño y el multiplicador, el stop guardado ya dice cuánto
   * arriesgabas: no hace falta teclear el importe.
   */
  size: number | null;
  contractSize: number | null;
}) {
  const [state, formAction, pending] = useActionState(saveJournalEntry, initialState);

  // Controlado solo el recuadro de notas, porque las plantillas escriben en él.
  // El resto del formulario sigue sin control: un `defaultValue` no se pierde al
  // re-renderizar y aquí no hace falta nada más.
  const [notes, setNotes] = useState(journalEntry?.notes ?? "");

  /**
   * Si hay algo escrito sin guardar.
   *
   * Se marca al primer cambio en cualquier campo, en vez de comparar todos los
   * valores con los iniciales: el formulario es casi todo no controlado --los
   * `defaultValue` no se pierden al re-renderizar-- así que no hay una copia
   * del estado con la que comparar, y añadirla sería duplicar el formulario
   * entero sólo para saber si cambió.
   */
  const [sucio, setSucio] = useState(false);

  /**
   * Cuándo avisar, derivado y no puesto desde un efecto.
   *
   * Se marca sucio al primer cambio y se limpia al enviar. Un guardado que
   * **falló** vuelve a contar como sin guardar por definición, así que se
   * deriva de `state.error` en vez de volver a marcarlo a mano: puesto desde
   * un efecto sería un `setState` durante el render, que además de estar
   * prohibido pinta dos veces.
   */
  const avisar = (sucio || state.error !== null) && !pending;

  useEffect(() => {
    if (state.success) toast.success("Diario guardado.");
    if (state.error) toast.error(state.error);
  }, [state]);

  // Any value already on the trade that isn't one of the known options
  // (e.g. free text typed before this form had checkboxes) stays selectable
  // instead of silently disappearing from the form.
  const emotionValues = journalEntry?.emotional_state ?? null;
  const mistakeValues = journalEntry?.mistake_tag ?? null;
  const emotionOptions = useMemo(() => mergeOptions(EMOTION_OPTIONS, emotionValues), [emotionValues]);
  const mistakeOptions = useMemo(() => mergeOptions(MISTAKE_OPTIONS, mistakeValues), [mistakeValues]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diario de la operación</CardTitle>
        <CardDescription>
          Campos subjetivos que registras tú -- nunca se infieren automáticamente de los datos de Coinbase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Quince minutos de diario se perdían enteros al pulsar atrás sin
            querer, y no había forma de recuperarlos. */}
        <UnsavedGuard
          when={avisar}
          message="Tienes el diario a medias y sin guardar. ¿Seguro que quieres salir?"
        />
        <form
          action={(formData) => {
            // Al enviar deja de estar sucio. Si el guardado falla, `avisar` lo
            // vuelve a poner por su cuenta.
            setSucio(false);
            formAction(formData);
          }}
          onInput={() => setSucio(true)}
          className="flex flex-col gap-6"
        >
          <input type="hidden" name="tradeId" value={tradeId} />

          {/* Grouped by *when* you fill each part in -- the plan before
              entering, how it went during, and what you take away after.
              Previously these were one flat eleven-field grid where a stop
              loss sat next to an emotion with identical visual weight. */}
          <FieldGroup title="El plan" subtitle="Lo que tenías pensado antes de entrar">
            <Field label="Estrategia" htmlFor="strategy_id">
              <Select name="strategy_id" defaultValue={journalEntry?.strategy_id ?? "NONE"}>
                <SelectTrigger id="strategy_id">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin asignar</SelectItem>
                  {strategies.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Setup" htmlFor="setup_grade">
              <Select name="setup_grade" defaultValue={currentSetupGrade ?? "NONE"}>
                <SelectTrigger id="setup_grade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin calificar</SelectItem>
                  {SETUP_GRADES.map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Dirección planeada" htmlFor="planned_direction">
              <Select name="planned_direction" defaultValue={journalEntry?.planned_direction ?? "NONE"}>
                <SelectTrigger id="planned_direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Sin definir</SelectItem>
                  <SelectItem value="LONG">Long</SelectItem>
                  <SelectItem value="SHORT">Short</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Sesgo HTF" htmlFor="htf_bias">
              <OptionSelect
                id="htf_bias"
                name="htf_bias"
                options={HTF_BIAS_OPTIONS}
                current={journalEntry?.htf_bias ?? null}
              />
            </Field>

            <Field label="Proximidad a soporte/resistencia" htmlFor="sr_proximity">
              <OptionSelect
                id="sr_proximity"
                name="sr_proximity"
                options={SR_PROXIMITY_OPTIONS}
                current={journalEntry?.sr_proximity ?? null}
              />
            </Field>

            <Field label="Cuánto arriesgo" htmlFor="risk_amount">
              <RiskReading
                name="risk_amount"
                defaultValue={journalEntry?.risk_amount ?? null}
                accountSize={accountSize}
                maxRiskPct={maxRiskPct}
                netPnl={netPnl}
                // Del stop ya guardado, no del que estás tecleando: el campo
                // del stop vive en su propio componente con su propio estado,
                // y levantarlo hasta aquí para que la cifra se mueva mientras
                // escribes no vale lo que cuesta. En cuanto guardas, sale.
                stopLossPrice={
                  journalEntry?.stop_loss_price ? Number(journalEntry.stop_loss_price) : null
                }
                direction={direction}
                entryWap={entryPrice ? Number(entryPrice) : null}
                size={size}
                contractSize={contractSize}
              />
            </Field>

            <Field label="Stop loss planeado" htmlFor="stop_loss_price">
              <PlannedPriceField
                id="stop_loss_price"
                name="stop_loss_price"
                defaultValue={journalEntry?.stop_loss_price ?? null}
                entryPrice={entryPrice}
                direction={direction}
                kind="STOP"
              />
            </Field>

            <Field label="Take profit planeado" htmlFor="take_profit_price">
              <PlannedPriceField
                id="take_profit_price"
                name="take_profit_price"
                defaultValue={journalEntry?.take_profit_price ?? null}
                entryPrice={entryPrice}
                direction={direction}
                kind="TARGET"
              />
            </Field>
          </FieldGroup>

          <FieldGroup title="Cómo salió" subtitle="Qué tan bien ejecutaste lo que habías planeado">
            <Field label="Resultado en R" htmlFor="result_r" hint="Cuántas veces tu riesgo inicial ganaste o perdiste. 2R = ganaste el doble de lo que arriesgabas.">
              <Input
                id="result_r"
                name="result_r"
                type="number"
                step="any"
                autoComplete="off"
                defaultValue={journalEntry?.result_r ?? ""}
              />
            </Field>

            <Field label="Adherencia al plan (1-5)" htmlFor="plan_adherence">
              <RatingSelect
                id="plan_adherence"
                name="plan_adherence"
                current={journalEntry?.plan_adherence ?? null}
              />
            </Field>

            <Field label="Calidad de entrada (1-5)" htmlFor="entry_quality">
              <RatingSelect
                id="entry_quality"
                name="entry_quality"
                current={journalEntry?.entry_quality ?? null}
              />
            </Field>
          </FieldGroup>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-medium text-foreground">Qué te llevas</h3>
              <p className="text-xs text-muted-foreground">Lo que quieres recordar la próxima vez</p>
            </div>

            <CheckboxGroupField
              label="Emociones"
              name="emotional_state"
              options={emotionOptions}
              defaultValues={splitList(emotionValues)}
            />

            <CheckboxGroupField
              label="Errores"
              name="mistake_tag"
              options={mistakeOptions}
              defaultValues={splitList(mistakeValues)}
            />

            <Field label="Lección aprendida" htmlFor="lesson_learned">
              <Textarea
                id="lesson_learned"
                name="lesson_learned"
                rows={2}
                autoComplete="off"
                defaultValue={journalEntry?.lesson_learned ?? ""}
              />
            </Field>

            <Field label="Notas" htmlFor="notes">
              <div className="flex flex-col gap-2">
                <Textarea
                  id="notes"
                  name="notes"
                  rows={notes.trim() === "" ? 4 : 10}
                  autoComplete="off"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <TemplatePicker value={notes} onChange={setNotes} />
              </div>
            </Field>
          </div>

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar diario"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function mergeOptions(known: string[], storedValue: string | null): string[] {
  const stored = splitList(storedValue);
  const extra = stored.filter((v) => !known.includes(v));
  return extra.length > 0 ? [...known, ...extra] : known;
}

/** One titled block of related fields, so the form reads as three short steps instead of one long wall. */
function FieldGroup({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </Label>
      {children}
    </div>
  );
}

/**
 * Real <button>s, not a <label> wrapping a visually-hidden checkbox -- the
 * checkbox-in-label version was clickable but focusing the (clipped, sr-only)
 * checkbox made the browser jump-scroll the page toward it. A plain button
 * never has that failure mode. Native form submission is preserved by
 * rendering one hidden input per currently-selected option instead of relying
 * on real checkboxes' checked state.
 */
function CheckboxGroupField({
  label,
  name,
  options,
  defaultValues,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValues: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultValues));

  function toggle(option: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = selected.has(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={checked}
              onClick={() => toggle(option)}
              className={cn(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors select-none",
                checked
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      {[...selected].map((option) => (
        <input key={option} type="hidden" name={name} value={option} />
      ))}
    </div>
  );
}

/**
 * A select over a closed vocabulary that still keeps whatever was already
 * stored.
 *
 * These fields used to be free text, and Notion imports filled them with
 * phrases that are not on any list. Dropping those silently on the next
 * save would quietly rewrite history, so an unknown value is offered as its
 * own option and stays selected until the user changes it.
 */
function OptionSelect({
  id,
  name,
  options,
  current,
}: {
  id: string;
  name: string;
  options: readonly string[];
  current: string | null;
}) {
  const known = current === null || options.includes(current);
  return (
    <Select name={name} defaultValue={current ?? ""}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Sin especificar" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
        {!known && current ? <SelectItem value={current}>{current}</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}

/** 1-5 with words attached, so today's 4 means the same as last month's 4. */
function RatingSelect({ id, name, current }: { id: string; name: string; current: number | null }) {
  return (
    <Select name={name} defaultValue={current === null ? "" : String(current)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Sin puntuar" />
      </SelectTrigger>
      <SelectContent>
        {RATING_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
