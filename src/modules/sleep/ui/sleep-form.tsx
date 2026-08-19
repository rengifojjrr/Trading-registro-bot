"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { ChipGroup } from "@/core/ui/chip-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveSleepEntry, type SleepFormState } from "@/modules/sleep/actions";
import { BEFORE_BED, MOOD_ON_WAKING, WOKE_HOW, clockFromTimestamp } from "@/modules/sleep/domain/sleep";
import type { SleepEntryRow } from "@/modules/sleep/queries";

const initialState: SleepFormState = { error: null, success: false };

/**
 * Registrar una noche.
 *
 * Las dos horas van primero y son lo único que hace falta rellenar: de ahí
 * sale la duración, que es el número que hoy no tienes. Todo lo demás es
 * opcional, y el campo del sueño narrado se queda al final con sitio de
 * sobra, porque es lo que de verdad se relee meses después.
 */
export function SleepForm({
  date,
  entry,
  timezone,
}: {
  date: string;
  entry: SleepEntryRow | null;
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(saveSleepEntry, initialState);

  useEffect(() => {
    if (state.success) toast.success("Noche guardada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar la noche</CardTitle>
        <CardDescription>
          Con la hora de acostarte y la de levantarte basta -- la duración se calcula sola, incluso
          cruzando la medianoche.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="sleep_date" value={date} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Me acosté" htmlFor="bedtime">
              <Input
                id="bedtime"
                name="bedtime"
                type="time"
                defaultValue={clockFromTimestamp(entry?.slept_at ?? null, timezone)}
              />
            </Field>
            <Field label="Me levanté" htmlFor="wake_time">
              <Input
                id="wake_time"
                name="wake_time"
                type="time"
                defaultValue={clockFromTimestamp(entry?.woke_at ?? null, timezone)}
              />
            </Field>
            <Field label="Puntaje (0-10)" htmlFor="score">
              <Input
                id="score"
                name="score"
                type="number"
                min={0}
                max={10}
                step="0.5"
                inputMode="decimal"
                defaultValue={entry?.score ?? ""}
              />
            </Field>
          </div>

          <Field label="Antes de dormir">
            <ChipGroup name="before_bed" options={BEFORE_BED} defaultValue={entry?.before_bed ?? []} />
          </Field>

          <Field label="Cómo desperté">
            <ChipGroup name="woke_how" options={WOKE_HOW} defaultValue={entry?.woke_how ?? []} />
          </Field>

          <Field label="Ánimo al despertar">
            <ChipGroup
              name="mood_on_waking"
              options={MOOD_ON_WAKING}
              defaultValue={entry?.mood_on_waking ?? []}
            />
          </Field>

          <Field label="Qué soñé" htmlFor="dream">
            <Textarea
              id="dream"
              name="dream"
              rows={5}
              placeholder="Lo que recuerdes, aunque sean fragmentos sueltos."
              defaultValue={entry?.dream ?? ""}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dónde dormí" htmlFor="place">
              <Input id="place" name="place" defaultValue={entry?.place ?? ""} autoComplete="off" />
            </Field>
            <Field label="Notas" htmlFor="notes">
              <Input id="notes" name="notes" defaultValue={entry?.notes ?? ""} autoComplete="off" />
            </Field>
          </div>

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {entry ? "Actualizar la noche" : "Guardar la noche"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
