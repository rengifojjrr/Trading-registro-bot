import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/core/ui/delete-button";
import { EntityAttachments } from "@/core/ui/entity-attachments";
import { EntityComments } from "@/core/ui/entity-comments";
import { EntityRelations } from "@/core/ui/entity-relations";
import type { AttachmentRow, AttachmentSlot } from "@/core/attachment-kinds";
import type { CommentRow } from "@/core/comments";
import type { RelatedRow } from "@/core/relations";
import type { EntityKind } from "@/types/database";

/**
 * El marco de una ficha.
 *
 * Las seis fichas de vida se parecen tanto que escribirlas seis veces sería
 * copiar seis veces el mismo encabezado y las mismas tres cajas del pie. Lo
 * que cambia entre ellas -- los campos -- entra por `children`.
 *
 * El orden no es casual: lo propio de la entidad arriba, y debajo lo que se le
 * cuelga. Los comentarios van los últimos porque son lo que se añade con el
 * tiempo, y ponerlos arriba empujaría los datos fuera de la pantalla en
 * cuanto hubiera tres.
 */
export function DetailShell({
  kind,
  entityId,
  path,
  backHref,
  backLabel,
  icon,
  title,
  subtitle,
  colorToken,
  children,
  comments,
  attachments,
  attachmentSlots,
  related,
}: {
  kind: EntityKind;
  entityId: string;
  /** La propia ruta, para refrescarla tras cada cambio. */
  path: string;
  backHref: Route;
  backLabel: string;
  icon?: string | null;
  title: string;
  subtitle?: ReactNode;
  colorToken: string;
  children: ReactNode;
  comments: (CommentRow & { when: string })[];
  attachments: AttachmentRow[];
  attachmentSlots?: readonly AttachmentSlot[];
  related: RelatedRow[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          href={backHref}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>

        <div className="flex flex-wrap items-start gap-3">
          {icon ? (
            <span className="text-3xl leading-none" aria-hidden>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-semibold leading-tight"
              style={{ color: `var(${colorToken})` }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
            ) : null}
          </div>

          <DeleteButton
            kind={kind}
            entityId={entityId}
            path={path}
            label={title}
            redirectTo={backHref}
            variant="text"
            className="mt-1"
          />
        </div>
      </div>

      {children}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vínculos</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityRelations kind={kind} entityId={entityId} path={path} related={related} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ficheros</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityAttachments
            kind={kind}
            entityId={entityId}
            path={path}
            attachments={attachments}
            slots={attachmentSlots}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comentarios</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityComments kind={kind} entityId={entityId} path={path} comments={comments} />
        </CardContent>
      </Card>
    </div>
  );
}
