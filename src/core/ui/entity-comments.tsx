"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addCommentAction, editCommentAction, removeCommentAction } from "@/core/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CommentRow } from "@/core/comments";
import type { EntityKind } from "@/types/database";

/**
 * El hilo de una ficha.
 *
 * Notion deja abrir un hilo en cualquier página, y esa es la vía por la que
 * alguien deja una nota sin tocar el contenido. Sin esto, anotar una pieza
 * obliga a reescribir sus campos y la nota acaba mezclada con el dato.
 *
 * Las fechas se pintan en el servidor y llegan ya formateadas: leer el reloj
 * durante el render da una fecha distinta en el servidor y en el navegador, y
 * React lo marca como error de hidratación.
 */
export function EntityComments({
  kind,
  entityId,
  path,
  comments,
}: {
  kind: EntityKind;
  entityId: string;
  path: string;
  comments: (CommentRow & { when: string })[];
}) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function submit() {
    const body = draft.trim();
    if (body.length === 0) return;

    startTransition(async () => {
      const result = await addCommentAction(kind, entityId, path, body);
      if (result.ok) setDraft("");
      else toast.error(result.error ?? "No se pudo guardar.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nada anotado todavía. Un comentario sirve para lo que no cabe en los campos.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-md border border-border p-3">
              {editingId === comment.id ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    rows={3}
                    aria-label="Editar comentario"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await editCommentAction(comment.id, path, editDraft);
                          if (result.ok) setEditingId(null);
                          else toast.error(result.error ?? "No se pudo guardar.");
                        })
                      }
                    >
                      Guardar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{comment.when}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditDraft(comment.body);
                      }}
                      className="flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                      <Pencil className="size-3" aria-hidden />
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await removeCommentAction(comment.id, path);
                        })
                      }
                      className="flex items-center gap-1 transition-colors hover:text-negative disabled:opacity-50"
                    >
                      <Trash2 className="size-3" aria-hidden />
                      Borrar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Escribe un comentario…"
          rows={2}
          aria-label="Nuevo comentario"
        />
        <div>
          <Button type="button" size="sm" onClick={submit} disabled={pending || draft.trim() === ""}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Comentar
          </Button>
        </div>
      </div>
    </div>
  );
}
