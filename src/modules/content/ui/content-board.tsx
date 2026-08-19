"use client";

import { ArrowRight, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { deletePiece, setPieceStatus } from "@/modules/content/actions";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  nextStatus,
  type ContentStatus,
} from "@/modules/content/domain/content";
import type { PieceRow } from "@/modules/content/queries";

/**
 * La cola por estados.
 *
 * En columnas y no en lista porque la pregunta de este módulo no es «qué
 * tengo» sino «dónde se me está atascando»: seis piezas en «Falta editar» y
 * ninguna en «Falta grabar» se ve de un vistazo, y en una lista no.
 *
 * Diez columnas no caben en una pantalla, así que el tablero se desplaza en
 * horizontal igual que el de Notion. Se prefiere eso a agrupar estados: los
 * diez existen precisamente porque cada uno nombra un atasco distinto, y
 * juntarlos devolvería el «en curso» que no dice nada.
 */
export function ContentBoard({
  pieces,
  today,
  statuses = STATUS_ORDER,
  hideEmpty = false,
}: {
  pieces: PieceRow[];
  today: string;
  /** Qué columnas dibujar. El tablero del editor pasa sólo las suyas. */
  statuses?: readonly ContentStatus[];
  hideEmpty?: boolean;
}) {
  const columns = statuses
    .map((status) => ({ status, items: pieces.filter((p) => p.status === status) }))
    .filter((column) => !hideEmpty || column.items.length > 0);

  if (columns.length === 0) {
    return <p className="text-sm text-muted-foreground">Nada por aquí ahora mismo.</p>;
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex gap-3">
        {columns.map((column) => (
          <div
            key={column.status}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border p-3"
          >
            <h3 className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {STATUS_LABELS[column.status]}
              <span className="tabular-nums">{column.items.length}</span>
            </h3>
            {column.items.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nada aquí.</p>
            ) : (
              column.items.map((piece) => <PieceCard key={piece.id} piece={piece} today={today} />)
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PieceCard({ piece, today }: { piece: PieceRow; today: string }) {
  const [pending, startTransition] = useTransition();
  const next = nextStatus(piece.status);
  const late =
    piece.status !== "PUBLICADO" && piece.planned_date !== null && piece.planned_date < today;

  // El enlace publicado manda sobre el del montaje: si existe, la pieza ya
  // está fuera y es donde uno quiere ir.
  const link = piece.url ?? piece.final_url;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-border p-2.5",
        late && "border-negative/50",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm leading-snug">{piece.title}</span>
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

      {piece.summary ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{piece.summary}</p>
      ) : null}

      {piece.channels.length > 0 || piece.platforms.length > 0 || piece.planned_date ? (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {piece.channels.map((c) => (
            <Badge key={c} variant="outline" className="text-[0.65rem]">
              {c}
            </Badge>
          ))}
          {piece.platforms.map((p) => (
            <span key={p} className="rounded-full border border-border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
              {p}
            </span>
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
            onClick={() =>
              startTransition(async () => {
                await setPieceStatus(piece.id, next);
              })
            }
            disabled={pending}
            className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--mod-content)" }}
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-3" aria-hidden />
            )}
            {STATUS_LABELS[next]}
          </button>
        ) : null}

        {link ? (
          <a
            href={link}
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
