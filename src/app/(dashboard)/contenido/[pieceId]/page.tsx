import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ATTACHMENT_SLOTS } from "@/core/attachments";
import { fetchEntityExtras } from "@/core/entity-extras";
import { DetailShell } from "@/core/ui/detail-shell";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { STATUS_LABELS } from "@/modules/content/domain/content";
import { fetchPiece } from "@/modules/content/queries";
import { PieceForm } from "@/modules/content/ui/piece-form";

/**
 * La ficha de una pieza.
 *
 * El formulario ya sabía editar desde que se escribió -- hace
 * `editing ? updatePiece : createPiece` -- pero las dos páginas que lo
 * montaban lo montaban siempre vacío, así que esa mitad del código no se
 * ejecutaba nunca. Esto es lo que le faltaba: una puerta.
 *
 * Las tres ranuras de fichero están aquí y no en los demás módulos porque
 * aquí sí significan cosas distintas: el material grabado, el montaje y la
 * versión final no son intercambiables.
 */
export default async function PieceDetailPage({
  params,
}: {
  params: Promise<{ pieceId: string }>;
}) {
  const { pieceId } = await params;

  const piece = await fetchPiece(pieceId);
  if (!piece) notFound();

  const [timezone, extras] = await Promise.all([
    userTimezone(),
    fetchEntityExtras("CONTENIDO", piece.id),
  ]);

  const subtitle = [
    STATUS_LABELS[piece.status],
    piece.planned_date ? `para el ${formatDate(`${piece.planned_date}T00:00:00Z`, timezone)}` : null,
    ...piece.channels,
    ...piece.platforms,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="CONTENIDO"
      entityId={piece.id}
      path={`/contenido/${piece.id}`}
      backHref="/contenido"
      backLabel="Tablero de contenido"
      icon={piece.icon}
      title={piece.title}
      subtitle={subtitle}
      colorToken="--mod-content"
      comments={extras.comments}
      attachments={extras.attachments}
      attachmentSlots={ATTACHMENT_SLOTS}
      related={extras.related}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">La pieza</CardTitle>
        </CardHeader>
        <CardContent>
          <PieceForm piece={piece} />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
