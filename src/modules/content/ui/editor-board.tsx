"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateEditorFields } from "@/modules/content/actions";
import { EDITOR_STATUSES, STATUS_LABELS } from "@/modules/content/domain/content";
import type { PieceRow } from "@/modules/content/queries";

/**
 * El tablero del editor: la vista «Para Luis» del calendario de Notion.
 *
 * Enseña exactamente lo que enseña allí -- el título, las notas de edición y
 * el tipo de edición -- y nada más. No es una simplificación por pereza: la
 * fecha de publicación, el canal y los enlaces finales no son suyos, y
 * mostrarlos invita a tocarlos.
 *
 * Por el mismo motivo lo único editable son el estado y las notas. Es la
 * misma frontera que ya existe en Notion, sólo que aquí la impone el código
 * en lugar de la costumbre.
 */
export function EditorBoard({ pieces }: { pieces: PieceRow[] }) {
  if (pieces.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay nada pendiente de edición ahora mismo.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pieces.map((piece) => (
        <EditorCard key={piece.id} piece={piece} />
      ))}
    </div>
  );
}

function EditorCard({ piece }: { piece: PieceRow }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(piece.status);
  const [notes, setNotes] = useState(piece.edit_notes ?? "");

  const dirty = status !== piece.status || notes !== (piece.edit_notes ?? "");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-medium">{piece.title}</span>
        {piece.edit_styles.map((style) => (
          <Badge key={style} variant="outline">
            {style}
          </Badge>
        ))}
      </div>

      {piece.video_url ? (
        <a
          href={piece.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline underline-offset-4"
          style={{ color: "var(--mod-content)" }}
        >
          Material grabado
        </a>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Notas de edición</span>
        <Textarea
          rows={3}
          value={notes}
          maxLength={4000}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Qué falta, qué cambiar, dónde está el material."
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger aria-label={`Estado de ${piece.title}`} className="max-w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EDITOR_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              await updateEditorFields(piece.id, status, notes);
              toast.success("Guardado.");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  );
}
