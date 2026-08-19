"use client";

import { ArrowRight, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";

import { ChipGroup } from "@/core/ui/chip-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPiece, deletePiece, setPieceStatus, type ContentFormState } from "@/modules/content/actions";
import {
  PLATFORMS,
  STATUS_LABELS,
  STATUS_ORDER,
  nextStatus,
  type ContentStatus,
} from "@/modules/content/domain/content";
import type { PieceRow } from "@/modules/content/queries";
import { cn } from "@/lib/utils";

const initial: ContentFormState = { error: null, success: false };

/** Alta de pieza. Con el título basta: una idea hay que poder apuntarla en dos segundos. */
export function NewPiece() {
  const [state, formAction, pending] = useActionState(createPiece, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      toast.success("Pieza añadida.");
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input name="title" placeholder="¿Sobre qué va?" maxLength={200} required className="min-w-52 flex-1" />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" aria-hidden />}
          Añadir
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="planned_date" type="date" aria-label="Fecha prevista" />
        <Input name="url" type="url" placeholder="Enlace (cuando esté publicada)" maxLength={500} />
      </div>
      <ChipGroup name="platforms" options={PLATFORMS} accent="--mod-content" />
      <Input name="notes" placeholder="Notas" maxLength={4000} />
    </form>
  );
}

/**
 * La cola por estados.
 *
 * En columnas y no en lista porque la pregunta de este módulo no es «qué
 * tengo» sino «dónde se me está atascando»: cinco ideas y nada grabado se ve
 * de un vistazo, en una lista no.
 */
export function ContentBoard({ pieces, today }: { pieces: PieceRow[]; today: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {STATUS_ORDER.map((status) => {
        const items = pieces.filter((p) => p.status === status);
        return (
          <div key={status} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <h3 className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {STATUS_LABELS[status]}
              <span className="tabular-nums">{items.length}</span>
            </h3>
            {items.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nada aquí.</p>
            ) : (
              items.map((piece) => <PieceCard key={piece.id} piece={piece} today={today} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

function PieceCard({ piece, today }: { piece: PieceRow; today: string }) {
  const [pending, startTransition] = useTransition();
  const next = nextStatus(piece.status);
  const late = piece.status !== "PUBLICADO" && piece.planned_date !== null && piece.planned_date < today;

  function advance(status: ContentStatus) {
    startTransition(async () => {
      await setPieceStatus(piece.id, status);
    });
  }

  return (
    <div className={cn("flex flex-col gap-1.5 rounded-md border border-border p-2.5", late && "border-negative/50")}>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm">{piece.title}</span>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await deletePiece(piece.id);
              toast.success("Pieza borrada.");
            })
          }
          disabled={pending}
          aria-label={`Borrar ${piece.title}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      {piece.platforms.length > 0 || piece.planned_date ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {piece.platforms.map((p) => (
            <Badge key={p} variant="outline">
              {p}
            </Badge>
          ))}
          {piece.planned_date ? (
            <span className={cn("tabular-nums", late ? "text-negative" : "text-muted-foreground")}>
              {piece.planned_date}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {next ? (
          <button
            type="button"
            onClick={() => advance(next)}
            disabled={pending}
            className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--mod-content)" }}
          >
            {pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <ArrowRight className="size-3" aria-hidden />}
            {STATUS_LABELS[next]}
          </button>
        ) : null}
        {piece.url ? (
          <a
            href={piece.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" aria-hidden />
            Ver
          </a>
        ) : null}
      </div>
    </div>
  );
}
