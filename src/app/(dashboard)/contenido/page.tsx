import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchModuleViews } from "@/core/module-views";
import { fetchTemplates } from "@/core/templates";
import { todayIn } from "@/core/today";
import { SearchBox } from "@/core/ui/search-box";
import { ViewBar } from "@/core/ui/view-bar";
import { userTimezone } from "@/core/user-settings";
import { countPieces, matchesSearch } from "@/modules/content/domain/content";
import { contentDatabaseId } from "@/modules/content/notion-import";
import { fetchPieces } from "@/modules/content/queries";
import { ContentBoard } from "@/modules/content/ui/content-board";
import { NotionImportButton } from "@/modules/content/ui/notion-import-button";
import { PieceForm } from "@/modules/content/ui/piece-form";

/**
 * Contenido: el tablero.
 *
 * Es una traducción del calendario real de Notion -- «📷 Social Media Content
 * Calendar» -- y no un diseño nuevo. Su decisión más importante son los diez
 * estados: cada uno nombra un cuello de botella concreto en lugar del clásico
 * «pendiente / en curso / hecho», que no dice *qué* falta.
 *
 * Las cifras de arriba cuentan siempre el calendario entero, aunque haya un
 * filtro puesto: son el estado del módulo, no el de la búsqueda, y hacerlas
 * seguir al filtro convertiría «tres atrasadas» en un número que cambia según
 * lo que uno haya tecleado.
 */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = q ?? "";

  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const [pieces, views, templates] = await Promise.all([
    fetchPieces(),
    fetchModuleViews("content"),
    fetchTemplates("content"),
  ]);

  const visible = pieces.filter((piece) => matchesSearch(piece, term));

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="En cola" value={String(counts.inProgress)} sub="sin publicar" />
        <StatTile
          size="lg"
          label="Atrasadas"
          value={String(counts.late)}
          tone={counts.late > 0 ? "negative" : "neutral"}
          sub="pasó su fecha"
        />
        <StatTile size="lg" label="Con el editor" value={String(counts.withEditor)} sub="ahora mismo" />
        <StatTile size="lg" label="Publicadas" value={String(counts.published)} sub="en total" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva pieza</CardTitle>
          <CardDescription>
            Con el título basta -- una idea hay que poder apuntarla en dos segundos. Lo demás se
            rellena cuando toque.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PieceForm templates={templates} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ViewBar moduleId="content" views={views} colorToken="--mod-content" />
          <SearchBox placeholder="Buscar una pieza…" />
        </div>

        <Card>
          <CardContent className="pt-6">
            <ContentBoard pieces={visible} today={today} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Desde Notion</CardTitle>
          <CardDescription>
            Trae el calendario tal cual está allí. Va en una sola dirección: mientras el editor
            trabaje en Notion, Notion manda en Contenido y esta pantalla refleja. Reimportar no
            duplica -- cada pieza recuerda de qué página vino.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotionImportButton configured={contentDatabaseId() !== null} />
        </CardContent>
      </Card>
    </>
  );
}
