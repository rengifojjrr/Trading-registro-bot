import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ENTITIES } from "@/core/entities";
import { listTrash } from "@/core/trash";
import { describeRetention, RETENTION_DAYS } from "@/core/trash-retention";
import { TrashList } from "@/core/ui/trash-list";
import { userTimezone } from "@/core/user-settings";
import { formatDateTime } from "@/lib/format";

/**
 * La papelera.
 *
 * Borrar era inmediato y definitivo, con el botón justo al lado del que cambia
 * el estado. Ahora lo borrado se archiva entero -- con sus hijos -- y se puede
 * devolver con su mismo identificador durante treinta días, que es lo que hace
 * Notion y lo que convierte un dedo torcido en el móvil en un susto en lugar
 * de una pérdida.
 *
 * El aviso de «deshacer» que sale al borrar cubre el caso normal; esta página
 * es para cuando el aviso ya se fue.
 */
export default async function TrashPage() {
  const [rows, timezone] = await Promise.all([listTrash(), userTimezone()]);

  // La cuenta atrás se enseña, no solo se ejecuta. Empezar a purgar en
  // silencio haría que alguien perdiera algo que creía recuperable, que es el
  // mismo fallo de confianza que la papelera existía para arreglar.
  const items = rows.map((row) => {
    const retention = describeRetention({ id: row.id, deletedAt: row.deletedAt });
    return {
      id: row.id,
      label: row.label,
      kindLabel: ENTITIES[row.kind].label,
      colorToken: ENTITIES[row.kind].colorToken,
      when: formatDateTime(row.deletedAt, timezone),
      retentionLabel: retention.label,
      expiring: retention.expiring,
    };
  });

  return (
    <>
      <PageHeader
        title="Papelera"
        description={`Lo borrado en los últimos ${RETENTION_DAYS} días. Restaurar lo devuelve con sus comentarios y sus vínculos; pasado ese plazo se borra del todo.`}
      />

      <Card>
        <CardContent className="pt-5">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              La papelera está vacía. Lo que borres aparecerá aquí y se guardará {RETENTION_DAYS} días.
            </p>
          ) : (
            <TrashList items={items} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
