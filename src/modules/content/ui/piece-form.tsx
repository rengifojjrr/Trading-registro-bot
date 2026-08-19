"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChipGroup } from "@/core/ui/chip-group";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { createPiece, updatePiece, type ContentFormState } from "@/modules/content/actions";
import {
  CHANNELS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EDIT_STYLES,
  EDIT_TIME_OPTIONS,
  PLATFORMS,
  RECORD_TIME_OPTIONS,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/modules/content/domain/content";
import type { PieceRow } from "@/modules/content/queries";

const initial: ContentFormState = { error: null, success: false };

/**
 * El formulario de una pieza, con todos los campos del calendario de Notion.
 *
 * Está partido en tres tramos plegados porque la mayoría de las veces se
 * viene sólo a apuntar una idea, y para eso el título basta. Los campos de
 * producción -- dificultad, tiempos, estilo de edición -- se rellenan después
 * y sólo si hacen falta; enseñarlos todos a la vez convertiría «se me ocurrió
 * un vídeo» en un formulario de quince campos, que es la forma más segura de
 * que la idea no se apunte.
 */
export function PieceForm({ piece }: { piece?: PieceRow }) {
  const editing = piece !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updatePiece : createPiece,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      if (!editing) formRef.current?.reset();
      toast.success(editing ? "Pieza guardada." : "Pieza añadida.");
    }
    if (state.error) toast.error(state.error);
  }, [state, editing]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {editing ? <input type="hidden" name="id" value={piece.id} /> : null}

      <div className="flex flex-wrap gap-2">
        <Input
          name="title"
          placeholder="¿Sobre qué va?"
          defaultValue={piece?.title ?? ""}
          maxLength={200}
          required
          className="min-w-52 flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {editing ? "Guardar" : "Añadir"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Estado">
          <Select name="status" defaultValue={piece?.status ?? "IDEA"}>
            <SelectTrigger aria-label="Estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Tipo">
          <Select name="content_type" defaultValue={piece?.content_type ?? "VIDEO"}>
            <SelectTrigger aria-label="Tipo de contenido">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {CONTENT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Fecha prevista">
          <Input
            name="planned_date"
            type="date"
            defaultValue={piece?.planned_date ?? ""}
            aria-label="Fecha prevista"
            className="tabular-nums"
          />
        </Field>
      </div>

      <Field label="Canal">
        <ChipGroup
          name="channels"
          options={CHANNELS}
          defaultValue={piece?.channels ?? []}
          accent="--mod-content"
        />
      </Field>

      <Field label="Plataforma">
        <ChipGroup
          name="platforms"
          options={PLATFORMS}
          defaultValue={piece?.platforms ?? []}
          accent="--mod-content"
        />
      </Field>

      <Field label="Resumen">
        <Textarea
          name="summary"
          rows={2}
          maxLength={2000}
          defaultValue={piece?.summary ?? ""}
          placeholder="De qué va, en una línea."
        />
      </Field>

      <CollapsibleSection title="Producción" subtitle="Cuánto cuesta grabarlo y editarlo.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Check name="has_script" label="Guion" defaultChecked={piece?.has_script ?? false} />
            <Check name="is_edited" label="Editado" defaultChecked={piece?.is_edited ?? false} />
            <Check
              name="has_thumbnail_ab"
              label="Miniatura A/B"
              defaultChecked={piece?.has_thumbnail_ab ?? false}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Dificultad de grabar">
              <Select name="record_difficulty" defaultValue={piece?.record_difficulty ?? ""}>
                <SelectTrigger aria-label="Dificultad de grabar">
                  <SelectValue placeholder="Sin decidir" />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((level) => (
                    <SelectItem key={level} value={level}>
                      {DIFFICULTY_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tiempo de grabación">
              <Select
                name="record_time"
                defaultValue={labelForMinutes(piece?.record_minutes, RECORD_TIME_OPTIONS, false)}
              >
                <SelectTrigger aria-label="Tiempo de grabación">
                  <SelectValue placeholder="Sin apuntar" />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.label} value={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tiempo de edición">
              <Select
                name="edit_time"
                defaultValue={labelForMinutes(
                  piece?.edit_minutes,
                  EDIT_TIME_OPTIONS,
                  piece?.edit_time_uncapped ?? false,
                )}
              >
                <SelectTrigger aria-label="Tiempo de edición">
                  <SelectValue placeholder="Sin apuntar" />
                </SelectTrigger>
                <SelectContent>
                  {EDIT_TIME_OPTIONS.map((option) => (
                    <SelectItem key={option.label} value={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Tipo de edición">
            <ChipGroup
              name="edit_styles"
              options={EDIT_STYLES}
              defaultValue={piece?.edit_styles ?? []}
              accent="--mod-content"
            />
          </Field>

          <Field label="Notas de edición">
            <Textarea
              name="edit_notes"
              rows={3}
              maxLength={4000}
              defaultValue={piece?.edit_notes ?? ""}
              placeholder="Lo que tiene que saber quien edita."
            />
          </Field>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Enlaces y notas" subtitle="El material y dónde acabó publicado.">
        <div className="flex flex-col gap-3">
          <Input
            name="video_url"
            type="url"
            maxLength={500}
            defaultValue={piece?.video_url ?? ""}
            placeholder="Enlace al material grabado"
          />
          <Input
            name="final_url"
            type="url"
            maxLength={500}
            defaultValue={piece?.final_url ?? ""}
            placeholder="Enlace al montaje final"
          />
          <Input
            name="url"
            type="url"
            maxLength={500}
            defaultValue={piece?.url ?? ""}
            placeholder="Enlace publicado"
          />
          <Textarea
            name="notes"
            rows={3}
            maxLength={4000}
            defaultValue={piece?.notes ?? ""}
            placeholder="Notas"
          />
        </div>
      </CollapsibleSection>
    </form>
  );
}

/**
 * Qué etiqueta corresponde a unos minutos guardados.
 *
 * Varias etiquetas comparten minutos -- «1 Dia» y «8 Horas» son ambas 480 --
 * así que la marca de «dejé de contar» decide primero; el resto se resuelve
 * por la primera coincidencia, que es la que el desplegable enseñará arriba.
 */
function labelForMinutes(
  minutes: number | null | undefined,
  options: typeof RECORD_TIME_OPTIONS,
  uncapped: boolean,
): string {
  if (minutes === null || minutes === undefined) return "";
  if (uncapped) return options.find((o) => o.uncapped)?.label ?? "";
  return options.find((o) => o.minutes === minutes && !o.uncapped)?.label ?? "";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-border accent-[var(--mod-content)]"
      />
      {label}
    </label>
  );
}
