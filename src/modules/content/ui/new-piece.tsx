"use client";

import { Loader2, Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateBar } from "@/core/ui/template-bar";
import type { Template } from "@/core/templates";
import { createPiece, type ContentFormState } from "@/modules/content/actions";

const initial: ContentFormState = { error: null, success: false };

/**
 * Apuntar una idea.
 *
 * El título es lo único que hace falta, y va solo: «se me ocurrió un vídeo» no
 * puede exigir elegir estado, tipo, canal, plataforma y fecha. Es la misma
 * decisión que ya tomaba el formulario largo al dejar el título arriba y
 * plegar los otros quince campos, sólo que ahora esos quince viven en la
 * encuesta de la ficha, que es donde se contestan de una en una.
 *
 * Con la plantilla al lado, que es lo que llena el resto de un toque: lo que
 * se apunta seguido suele ser del mismo tipo --otro corto para TikTok--, y por
 * eso la plantilla se queda puesta después de añadir en vez de tener que
 * volver a elegirla.
 */
export function NewPiece({ templates = [] }: { templates?: Template[] }) {
  const [state, formAction, pending] = useActionState(createPiece, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [applied, setApplied] = useState<Template | null>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      toast.success("Idea apuntada.");
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  const payload = applied?.payload ?? {};

  return (
    <form
      // Remontar al aplicar una plantilla: los campos ocultos que lleva son no
      // controlados, y sus valores por defecto sólo se leen al montar.
      key={applied?.id ?? "en-blanco"}
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3"
    >
      <TemplateBar
        moduleId="content"
        templates={templates}
        colorToken="--mod-content"
        onApply={setApplied}
        currentValues={() => ({
          payload: {
            status: String(payload.status ?? "IDEA"),
            content_type: String(payload.content_type ?? ""),
          },
          body: null,
        })}
      />

      <div className="flex flex-wrap gap-2">
        <Input
          name="title"
          placeholder="¿Sobre qué va?"
          maxLength={200}
          required
          className="min-w-52 flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" aria-hidden />}
          Añadir
        </Button>
      </div>

      {/* Lo que trae la plantilla viaja escondido: es lo que hace que apuntar
          otro corto para TikTok siga siendo un título y un botón. El resto se
          contesta luego en la ficha. */}
      <input type="hidden" name="status" value={String(payload.status ?? "IDEA")} />
      <input type="hidden" name="content_type" value={String(payload.content_type ?? "")} />
      {listaDe(payload.channels).map((c) => (
        <input key={`canal-${c}`} type="hidden" name="channels" value={c} />
      ))}
      {listaDe(payload.platforms).map((p) => (
        <input key={`plataforma-${p}`} type="hidden" name="platforms" value={p} />
      ))}
      {listaDe(payload.edit_styles).map((e) => (
        <input key={`edicion-${e}`} type="hidden" name="edit_styles" value={e} />
      ))}
      {listaDe(payload.record_difficulties).map((d) => (
        <input key={`dificultad-${d}`} type="hidden" name="record_difficulties" value={d} />
      ))}
      {applied?.body ? <input type="hidden" name="body" value={applied.body} /> : null}
    </form>
  );
}

function listaDe(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map(String) : [];
}
