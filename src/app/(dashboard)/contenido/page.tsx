import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { countPieces } from "@/modules/content/domain/content";
import { fetchPieces } from "@/modules/content/queries";
import { ContentBoard, NewPiece } from "@/modules/content/ui/content-board";

/**
 * Contenido.
 *
 * El único módulo que no venía de una plantilla de Notion: allí sólo existe
 * la casilla «Trabajar en las redes», que dice si trabajaste, no qué
 * publicaste. Esto registra lo segundo.
 */
export default async function ContentPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const pieces = await fetchPieces();
  const counts = countPieces(
    pieces.map((p) => ({
      status: p.status,
      plannedDate: p.planned_date,
      publishedAt: p.published_at,
    })),
    today,
  );

  return (
    <>
      <PageHeader
        title="Contenido"
        description="Dónde se atasca cada pieza, de la idea a publicada."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile size="lg" label="En cola" value={String(counts.inProgress)} sub="sin publicar" />
        <StatTile
          size="lg"
          label="Atrasadas"
          value={String(counts.late)}
          tone={counts.late > 0 ? "negative" : "neutral"}
          sub="pasó la fecha prevista"
        />
        <StatTile size="lg" label="Publicadas" value={String(counts.published)} sub="en total" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva pieza</CardTitle>
          <CardDescription>Con el título basta -- una idea hay que poder apuntarla en dos segundos.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewPiece />
        </CardContent>
      </Card>

      <ContentBoard pieces={pieces} today={today} />
    </>
  );
}
