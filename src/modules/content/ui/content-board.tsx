"use client";

import { ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/core/ui/delete-button";
import { DragBoard, MoveMenu, type BoardColumn } from "@/core/ui/drag-board";
import { cn } from "@/lib/utils";
import { setPieceStatus } from "@/modules/content/actions";
import { STATUS_LABELS, STATUS_ORDER, type ContentStatus } from "@/modules/content/domain/content";
import type { PieceRow } from "@/modules/content/queries";

/**
 * La cola por estados.
 *
 * En columnas y no en lista porque la pregunta de este módulo no es «qué
 * tengo» sino «dónde se me está atascando»: seis piezas en «Falta editar» y
 * ninguna en «Falta grabar» se ve de un vistazo, y en una lista no.
 *
 * Antes cada tarjeta sólo tenía un botón «siguiente estado», así que no se
 * podía devolver una pieza de «Editando» a «Falta grabar» ni saltarse un paso
 * cuando algo salía mejor de lo previsto: diez columnas en fila y un único
 * movimiento posible convierten el tablero en una cinta transportadora. Ahora
 * se arrastra a cualquiera, y el desplegable de cada tarjeta hace lo mismo con
 * el teclado.
 *
 * Diez columnas no caben en una pantalla, así que el tablero se desplaza en
 * horizontal igual que el de Notion. Se prefiere eso a agrupar estados: los
 * diez existen precisamente porque cada uno nombra un atasco distinto.
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
  const [, startTransition] = useTransition();

  const columns: BoardColumn<PieceRow>[] = statuses
    .map((status) => ({
      id: status,
      label: STATUS_LABELS[status],
      items: pieces.filter((p) => p.status === status),
    }))
    .filter((column) => !hideEmpty || column.items.length > 0);

  if (columns.length === 0) {
    return <p className="text-sm text-muted-foreground">Nada por aquí ahora mismo.</p>;
  }

  function move(id: string, toColumn: string) {
    const piece = pieces.find((p) => p.id === id);
    if (!piece || piece.status === toColumn) return;

    startTransition(async () => {
      await setPieceStatus(id, toColumn);
      toast.success(`«${piece.title}» → ${STATUS_LABELS[toColumn as ContentStatus]}`);
    });
  }

  return (
    <DragBoard
      columns={columns}
      itemId={(piece) => piece.id}
      onMove={move}
      colorToken="--mod-content"
      renderItem={(piece, column) => (
        <PieceCard
          piece={piece}
          today={today}
          columns={columns.map((c) => ({ id: c.id, label: c.label }))}
          currentColumn={column.id}
          onMove={(to) => move(piece.id, to)}
        />
      )}
    />
  );
}

function PieceCard({
  piece,
  today,
  columns,
  currentColumn,
  onMove,
}: {
  piece: PieceRow;
  today: string;
  columns: { id: string; label: string }[];
  currentColumn: string;
  onMove: (columnId: string) => void;
}) {
  const late =
    piece.status !== "PUBLICADO" && piece.planned_date !== null && piece.planned_date < today;

  // El enlace publicado manda sobre el del montaje: si existe, la pieza ya
  // está fuera y es donde uno quiere ir.
  const link = piece.url ?? piece.final_url;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border border-border bg-background p-2.5",
        late && "border-negative/50",
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          href={`/contenido/${piece.id}` as Route}
          className="min-w-0 flex-1 text-sm leading-snug hover:underline"
        >
          {piece.icon ? `${piece.icon} ` : ""}
          {piece.title}
        </Link>
        <DeleteButton
          kind="CONTENIDO"
          entityId={piece.id}
          path="/contenido"
          label={piece.title}
          className="[&_svg]:size-3.5"
        />
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
            <span
              key={p}
              className="rounded-full border border-border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground"
            >
              {p}
            </span>
          ))}
          {piece.planned_date ? (
            <span className={cn("tabular-nums", late ? "text-negative" : "text-muted-foreground")}>
              {piece.planned_date}
            </span>
          ) : null}
          {piece.body ? (
            <FileText className="size-3 text-muted-foreground" aria-label="Tiene guion" />
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <MoveMenu
          columns={columns}
          currentColumn={currentColumn}
          onMove={onMove}
          label={piece.title}
        />

        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3" aria-hidden />
            Ver
          </a>
        ) : null}
      </div>
    </div>
  );
}
