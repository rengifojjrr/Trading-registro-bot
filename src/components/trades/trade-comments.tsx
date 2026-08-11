"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { addComment, deleteComment, type CommentFormState } from "@/app/(dashboard)/trades/[tradeId]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

export interface TradeCommentRow {
  id: string;
  body: string;
  created_at: string;
}

const initialState: CommentFormState = { error: null, success: false };

/**
 * Free-form timestamped notes on a trade -- separate from the structured
 * journal fields above (see journal-form.tsx). The add-comment form is
 * keyed on comments.length so a successful submit (which revalidates the
 * page and grows the array) remounts it with an empty textarea, instead of
 * leaving the just-submitted text sitting in an uncontrolled input.
 */
export function TradeComments({
  tradeId,
  comments,
  timezone,
}: {
  tradeId: string;
  comments: TradeCommentRow[];
  timezone: string;
}) {
  const [state, formAction, pending] = useActionState(addComment, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comentarios</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comments.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
              >
                <div className="flex flex-col gap-1">
                  <p className="whitespace-pre-wrap">{comment.body}</p>
                  <span className="text-xs text-muted-foreground">{formatDate(comment.created_at, timezone)}</span>
                </div>
                <form action={deleteComment.bind(null, tradeId, comment.id)}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      if (!window.confirm("¿Eliminar este comentario?")) e.preventDefault();
                    }}
                  >
                    Eliminar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Todavía no hay comentarios en esta operación.</p>
        )}

        <form key={comments.length} action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="tradeId" value={tradeId} />
          <Textarea name="body" rows={2} placeholder="Agregar un comentario..." required />
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Comentar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
