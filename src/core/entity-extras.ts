import "server-only";

import { formatDateTime } from "@/lib/format";
import type { EntityKind } from "@/types/database";

import { fetchAttachments, type AttachmentRow } from "./attachments";
import { fetchComments, type CommentRow } from "./comments";
import { fetchRelated, type RelatedRow } from "./relations";
import { userTimezone } from "./user-settings";

/**
 * Lo que cuelga de una ficha, de una vez.
 *
 * Las seis fichas piden exactamente lo mismo, así que pedirlo por separado en
 * cada una serían dieciocho llamadas escritas a mano y dieciocho sitios donde
 * olvidarse de una. Van en paralelo porque no dependen entre sí.
 *
 * La fecha de los comentarios se formatea aquí, en el servidor: hacerlo en el
 * componente obligaría a leer el reloj durante el render, que es justo lo que
 * produce una fecha en el servidor y otra en el navegador.
 */

export interface EntityExtras {
  comments: (CommentRow & { when: string })[];
  attachments: AttachmentRow[];
  related: RelatedRow[];
}

export async function fetchEntityExtras(
  kind: EntityKind,
  entityId: string,
): Promise<EntityExtras> {
  const [timezone, comments, attachments, related] = await Promise.all([
    userTimezone(),
    fetchComments(kind, entityId),
    fetchAttachments(kind, entityId),
    fetchRelated(kind, entityId),
  ]);

  return {
    comments: comments.map((comment) => ({
      ...comment,
      when: formatDateTime(comment.createdAt, timezone),
    })),
    attachments,
    related,
  };
}
