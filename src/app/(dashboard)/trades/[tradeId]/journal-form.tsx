"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/types/database";

import { saveJournalEntry, type JournalFormState } from "./actions";

type JournalEntryRow = Database["public"]["Tables"]["journal_entries"]["Row"];

const initialState: JournalFormState = { error: null, success: false };

export function JournalForm({
  tradeId,
  journalEntry,
  strategies,
}: {
  tradeId: string;
  journalEntry: JournalEntryRow | null;
  strategies: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveJournalEntry, initialState);

  useEffect(() => {
    if (state.success) toast.success("Diario guardado.");
    if (state.error) toast.error(state.error);
  }, [state]);

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
            <Field label="Estrategia / setup" htmlFor="strategy_id">
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
              <Input id="htf_bias" name="htf_bias" defaultValue={journalEntry?.htf_bias ?? ""} />
            </Field>

            <Field label="Proximidad a soporte/resistencia" htmlFor="sr_proximity">
              <Input
                id="sr_proximity"
                name="sr_proximity"
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
                defaultValue={journalEntry?.risk_amount ?? ""}
              />
            </Field>

            <Field label="Resultado en R" htmlFor="result_r">
              <Input id="result_r" name="result_r" type="number" step="any" defaultValue={journalEntry?.result_r ?? ""} />
            </Field>

            <Field label="Stop loss planeado" htmlFor="stop_loss_price">
              <Input
                id="stop_loss_price"
                name="stop_loss_price"
                type="number"
                step="any"
                defaultValue={journalEntry?.stop_loss_price ?? ""}
              />
            </Field>

            <Field label="Take profit planeado" htmlFor="take_profit_price">
              <Input
                id="take_profit_price"
                name="take_profit_price"
                type="number"
                step="any"
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
                defaultValue={journalEntry?.entry_quality ?? ""}
              />
            </Field>

            <Field label="Estado emocional" htmlFor="emotional_state">
              <Input id="emotional_state" name="emotional_state" defaultValue={journalEntry?.emotional_state ?? ""} />
            </Field>

            <Field label="Error cometido" htmlFor="mistake_tag">
              <Input id="mistake_tag" name="mistake_tag" defaultValue={journalEntry?.mistake_tag ?? ""} />
            </Field>
          </div>

          <Field label="Lección aprendida" htmlFor="lesson_learned">
            <Textarea id="lesson_learned" name="lesson_learned" rows={2} defaultValue={journalEntry?.lesson_learned ?? ""} />
          </Field>

          <Field label="Notas" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={4} defaultValue={journalEntry?.notes ?? ""} />
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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
