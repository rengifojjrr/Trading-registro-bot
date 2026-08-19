"use client";

import { Download, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { removeAttachmentAction, uploadAttachmentAction } from "@/core/actions";
import {
  SLOT_LABELS,
  formatBytes,
  type AttachmentRow,
  type AttachmentSlot,
} from "@/core/attachment-kinds";
import { Button } from "@/components/ui/button";
import type { EntityKind } from "@/types/database";

/**
 * Los ficheros de una ficha.
 *
 * En el calendario de contenido hay dos propiedades de archivo -- «Videos» y
 * «Listo» -- donde viven los montajes y las versiones finales. La app guardaba
 * sólo direcciones de texto, así que el fichero seguía en Drive: si el enlace
 * caducaba, la pieza se quedaba sin nada.
 *
 * `slots` sólo se pasa donde las ranuras significan cosas distintas. En los
 * demás módulos un adjunto es un adjunto y elegir ranura sería una pregunta
 * sin respuesta interesante.
 */
export function EntityAttachments({
  kind,
  entityId,
  path,
  attachments,
  slots,
}: {
  kind: EntityKind;
  entityId: string;
  path: string;
  attachments: AttachmentRow[];
  slots?: readonly AttachmentSlot[];
}) {
  const [pending, startTransition] = useTransition();
  const [slot, setSlot] = useState<string>(slots?.[0] ?? "ADJUNTO");
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("slot", slot);

    startTransition(async () => {
      const result = await uploadAttachmentAction(kind, entityId, path, formData);
      if (!result.ok) toast.error(result.error ?? "No se pudo subir.");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin ficheros.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{file.fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {[slots ? SLOT_LABELS[file.slot as AttachmentSlot] : null, formatBytes(file.sizeBytes)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>

              {file.url ? (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ${file.fileName}`}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Download className="size-4" aria-hidden />
                </a>
              ) : null}

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await removeAttachmentAction(file.id, path);
                  })
                }
                aria-label={`Borrar ${file.fileName}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {slots ? (
          <select
            value={slot}
            onChange={(event) => setSlot(event.target.value)}
            aria-label="Tipo de fichero"
            className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
          >
            {slots.map((option) => (
              <option key={option} value={option}>
                {SLOT_LABELS[option]}
              </option>
            ))}
          </select>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          id={`file-${entityId}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <Button asChild size="sm" variant="outline" disabled={pending}>
          <label htmlFor={`file-${entityId}`} className="cursor-pointer">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Paperclip className="size-4" aria-hidden />
            )}
            Subir fichero
          </label>
        </Button>
        <span className="text-xs text-muted-foreground">Hasta 50 MB.</span>
      </div>
    </div>
  );
}
