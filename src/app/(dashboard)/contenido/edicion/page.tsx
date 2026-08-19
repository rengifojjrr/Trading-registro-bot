import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWorkTime } from "@/modules/content/domain/content";
import { EDITOR_STATUSES, STATUS_LABELS } from "@/modules/content/domain/content";
import { fetchPieces } from "@/modules/content/queries";
import { EditorBoard } from "@/modules/content/ui/editor-board";

/**
 * Contenido: Para Luis.
 *
 * La vista «Para Luis» del calendario de Notion, con sus mismos campos: el
 * título, las notas de edición y el tipo de edición. Nada más.
 *
 * Mientras Luis trabaje en Notion, esta pantalla es un espejo: se mira para
 * saber qué tiene él, no para darle órdenes. El día que se le abra la
 * aplicación, es la única pantalla que necesitaría ver -- y por eso sólo deja
 * cambiar el estado y las notas, que es exactamente lo que puede cambiar allí.
 */
export default async function EditorPage() {
  const pieces = await fetchPieces();
  const queue = pieces.filter((p) => EDITOR_STATUSES.includes(p.status));

  const measured = queue.filter((p) => p.edit_minutes !== null);
  const pendingMinutes = measured.reduce((sum, p) => sum + (p.edit_minutes ?? 0), 0);
  const isFloor = measured.some((p) => p.edit_time_uncapped);

  return (
    <>
      <PageHeader
        title="Para Luis"
        description="Lo que está en manos del editor, con lo que necesita saber y nada más."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile size="lg" label="En su cola" value={String(queue.length)} sub="piezas" />
        <StatTile
          size="lg"
          label="Trabajo estimado"
          value={measured.length === 0 ? "--" : formatWorkTime(pendingMinutes, isFloor)}
          sub={`${measured.length} con tiempo apuntado`}
          description="Suma de los tiempos de edición previstos. Sale de las mismas opciones que en Notion («2 Horas», «1 Dia»), traducidas a minutos para poder sumarlas."
        />
        <StatTile
          size="lg"
          label="Esperando link"
          value={String(queue.filter((p) => p.status === "EDITADO_FALTA_LINK").length)}
          sub="ya editadas"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>La cola de edición</CardTitle>
          <CardDescription>
            Sólo el estado y las notas se pueden cambiar aquí. La fecha, el canal y los enlaces
            finales no son suyos, y enseñarlos invitaría a tocarlos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditorBoard pieces={queue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          <p>
            Los tres estados que cuentan como «en edición» son{" "}
            {EDITOR_STATUSES.map((s) => STATUS_LABELS[s]).join(", ")}. Cuando una pieza sale de
            ellos deja de aparecer aquí sin que nadie tenga que quitarla.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
