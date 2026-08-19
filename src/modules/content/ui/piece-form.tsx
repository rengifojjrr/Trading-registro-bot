"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
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
import { IconPicker } from "@/core/ui/icon-picker";
import { TemplateBar } from "@/core/ui/template-bar";
import type { Template } from "@/core/templates";
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
export function PieceForm({
  piece,
  templates = [],
}: {
  piece?: PieceRow;
  templates?: Template[];
}) {
  const editing = piece !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updatePiece : createPiece,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [applied, setApplied] = useState<Template | null>(null);

  useEffect(() => {
    // Al crear se vacía el formulario, pero la plantilla se queda puesta: si
    // acabas de apuntar un vídeo corto para TikTok, lo siguiente que apuntas
    // suele ser otro igual, y quitarla obligaría a volver a elegirla cada vez.
    // `reset()` devuelve los campos a sus valores por defecto, que con una
    // plantilla aplicada son justo los suyos.
    if (state.success) {
      if (!editing) formRef.current?.reset();
      toast.success(editing ? "Pieza guardada." : "Pieza añadida.");
    }
    if (state.error) toast.error(state.error);
  }, [state, editing]);

  /**
   * De dónde sale el valor de cada campo.
   *
   * La plantilla pisa a la pieza y la pieza pisa al vacío. Los campos son no
   * controlados, así que aplicar una plantilla remonta el formulario entero
   * con la clave de abajo: es lo único que hace que las fichas de opción
   * múltiple -- que guardan su propio estado -- también se enteren.
   */
  const payload = applied?.payload ?? {};
  function value<T>(key: string, fallback: T): T {
    return key in payload ? (payload[key] as T) : fallback;
  }

  return (
    <form
      key={applied?.id ?? "en-blanco"}
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4"
    >
      {editing ? <input type="hidden" name="id" value={piece.id} /> : null}

      {!editing ? (
        <TemplateBar
          moduleId="content"
          templates={templates}
          colorToken="--mod-content"
          onApply={setApplied}
          currentValues={() => {
            const data = new FormData(formRef.current!);
            return {
              payload: {
                status: String(data.get("status") ?? "IDEA"),
                content_type: String(data.get("content_type") ?? ""),
                channels: data.getAll("channels").map(String),
                platforms: data.getAll("platforms").map(String),
                edit_styles: data.getAll("edit_styles").map(String),
                record_difficulties: data.getAll("record_difficulties").map(String),
              },
              body: String(data.get("body") ?? "") || null,
            };
          }}
        />
      ) : null}

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
          <Select name="status" defaultValue={value("status", piece?.status ?? "IDEA")}>
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
          <Select name="content_type" defaultValue={value("content_type", piece?.content_type ?? "VIDEO")}>
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
          defaultValue={value("channels", piece?.channels ?? [])}
          accent="--mod-content"
        />
      </Field>

      <Field label="Plataforma">
        <ChipGroup
          name="platforms"
          options={PLATFORMS}
          defaultValue={value("platforms", piece?.platforms ?? [])}
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
            {/*
              En Notion «DIFICULTAD DE GRABAR» admite varios valores a la vez
              y aquí se aplanaba a uno solo. Es un detalle pequeño, pero es de
              los que hacen que una cifra de la pantalla de análisis no cuadre
              con lo que uno recuerda.
            */}
            <Field label="Dificultad de grabar">
              <ChipGroup
                name="record_difficulties"
                options={DIFFICULTIES.map((level) => DIFFICULTY_LABELS[level])}
                defaultValue={value("record_difficulties", piece?.record_difficulties ?? [])}
                accent="--mod-content"
              />
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
              defaultValue={value("edit_styles", piece?.edit_styles ?? [])}
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
          <IconPicker name="icon" defaultValue={piece?.icon} />
        </div>
      </CollapsibleSection>

      {/*
        El guion.
        Vive en el cuerpo de la página en Notion, con la estructura HOOK /
        SCRIPT/NOTES / TAGS que traen todas tus piezas, y era lo único que la
        importación no traía. Es el trabajo de verdad del módulo, así que va
        desplegado de partida al editar y plegado al crear: una idea nueva no
        tiene guion todavía.
      */}
      <CollapsibleSection
        title="Guion"
        subtitle="El gancho, el texto y las etiquetas."
        defaultOpen={editing && (piece?.body ?? "") !== ""}
      >
        <Textarea
          name="body"
          rows={16}
          maxLength={20000}
          defaultValue={applied?.body ?? piece?.body ?? ""}
          placeholder={"**HOOK:**\n\n**SCRIPT/NOTES:**\n\n**TAGS:**"}
          className="font-mono text-sm"
        />
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
