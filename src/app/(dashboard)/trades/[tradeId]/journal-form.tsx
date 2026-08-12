"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
}: {
  tradeId: string;
  journalEntry: JournalEntryRow | null;
  strategies: { id: string; name: string }[];
  currentSetupGrade: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveJournalEntry, initialState);

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
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="tradeId" value={tradeId} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Input id="htf_bias" name="htf_bias" autoComplete="off" defaultValue={journalEntry?.htf_bias ?? ""} />
            </Field>

            <Field label="Proximidad a soporte/resistencia" htmlFor="sr_proximity">
              <Input
                id="sr_proximity"
                name="sr_proximity"
                autoComplete="off"
                defaultValue={journalEntry?.sr_proximity ?? ""}
                placeholder="p. ej. cerca de resistencia diaria"
              />
            </Field>

            <Field label="Riesgo (moneda de cuenta)" htmlFor="risk_amount">
              <Input
                id="risk_amount"
                name="risk_amount"
                type="number"
                step="any"
                autoComplete="off"
                defaultValue={journalEntry?.risk_amount ?? ""}
              />
            </Field>

            <Field label="Resultado en R" htmlFor="result_r">
              <Input
                id="result_r"
                name="result_r"
                type="number"
                step="any"
                autoComplete="off"
                defaultValue={journalEntry?.result_r ?? ""}
              />
            </Field>

            <Field label="Stop loss planeado" htmlFor="stop_loss_price">
              <Input
                id="stop_loss_price"
                name="stop_loss_price"
                type="number"
                step="any"
                autoComplete="off"
                defaultValue={journalEntry?.stop_loss_price ?? ""}
              />
            </Field>

            <Field label="Take profit planeado" htmlFor="take_profit_price">
              <Input
                id="take_profit_price"
                name="take_profit_price"
                type="number"
                step="any"
                autoComplete="off"
                defaultValue={journalEntry?.take_profit_price ?? ""}
              />
            </Field>

            <Field label="Adherencia al plan (1-5)" htmlFor="plan_adherence">
              <Input
                id="plan_adherence"
                name="plan_adherence"
                type="number"
                min={1}
                max={5}
                step={1}
                autoComplete="off"
                defaultValue={journalEntry?.plan_adherence ?? ""}
              />
            </Field>

            <Field label="Calidad de entrada (1-5)" htmlFor="entry_quality">
              <Input
                id="entry_quality"
                name="entry_quality"
                type="number"
                min={1}
                max={5}
                step={1}
                autoComplete="off"
                defaultValue={journalEntry?.entry_quality ?? ""}
              />
            </Field>
          </div>

          <CheckboxGroupField label="Emociones" name="emotional_state" options={emotionOptions} defaultValues={splitList(emotionValues)} />

          <CheckboxGroupField label="Errores" name="mistake_tag" options={mistakeOptions} defaultValues={splitList(mistakeValues)} />

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
            <Textarea id="notes" name="notes" rows={4} autoComplete="off" defaultValue={journalEntry?.notes ?? ""} />
          </Field>

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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
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
