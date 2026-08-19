import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ENTITIES } from "@/core/entities";
import { listTrash } from "@/core/trash";
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

  const items = rows.map((row) => ({
    id: row.id,
    label: row.label,
    kindLabel: ENTITIES[row.kind].label,
    colorToken: ENTITIES[row.kind].colorToken,
    when: formatDateTime(row.deletedAt, timezone),
  }));

  return (
    <>
      <PageHeader
        title="Papelera"
        description="Lo borrado en los últimos 30 días. Restaurar lo devuelve con sus comentarios y sus vínculos."
      />

      <Card>
        <CardContent className="pt-5">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              La papelera está vacía. Lo que borres aparecerá aquí y se guardará 30 días.
            </p>
          ) : (
            <TrashList items={items} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
