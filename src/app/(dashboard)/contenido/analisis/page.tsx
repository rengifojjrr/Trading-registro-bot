import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { ChartFrame } from "@/core/ui/chart-frame";
import { BarSeries, RankSeries } from "@/core/ui/charts";
import { userTimezone } from "@/core/user-settings";
import { STATUS_LABELS, formatWorkTime } from "@/modules/content/domain/content";
import {
  byChannel,
  byPlatform,
  funnel,
  minutesByEditStyle,
  overdue,
  publishedByMonth,
  workTotals,
  type AnalysablePiece,
} from "@/modules/content/domain/content-analysis";
import { fetchPieces } from "@/modules/content/queries";

/**
 * Contenido: análisis.
 *
 * Las cinco vistas de Notion son cinco filtros sobre la misma tabla. Ninguna
 * suma nada, porque una tabla no puede: no hay forma de saber allí cuántas
 * horas de edición llevas ni qué formato sale caro, con los tiempos guardados
 * como etiquetas de texto.
 *
 * Aquí esos tiempos son minutos, así que las preguntas caras se contestan
 * solas -- y el embudo, que es la primera gráfica, dice en una mirada dónde
 * está el tapón.
 */
export default async function ContentAnalysisPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const rows = await fetchPieces();
  const pieces: (AnalysablePiece & { title: string })[] = rows.map((p) => ({
    title: p.title,
    status: p.status,
    plannedDate: p.planned_date,
    publishedAt: p.published_at,
    channels: p.channels,
    platforms: p.platforms,
    recordMinutes: p.record_minutes,
    editMinutes: p.edit_minutes,
    editTimeUncapped: p.edit_time_uncapped,
    editStyles: p.edit_styles,
    contentType: p.content_type,
  }));

  const stages = funnel(pieces, STATUS_LABELS);
  const channels = byChannel(pieces);
  const platforms = byPlatform(pieces);
  const styles = minutesByEditStyle(pieces);
  const monthly = publishedByMonth(pieces, timezone);
  const totals = workTotals(pieces);
  const late = overdue(pieces, today);

  const published = pieces.filter((p) => p.status === "PUBLICADO").length;

  return (
    <>
      <PageHeader title="Análisis de contenido" description="Dónde se atasca, qué cuesta y qué sale." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="Piezas" value={String(pieces.length)} sub="en total" />
        <StatTile size="lg" label="Publicadas" value={String(published)} />
        <StatTile
          size="lg"
          label="Horas de edición"
          value={totals.measured === 0 ? "--" : formatWorkTime(totals.editMinutes, totals.isFloor)}
          sub={`${totals.measured} piezas con tiempo`}
          description="Suma de los tiempos apuntados. Si alguna pieza traía «después de las 10 dejé de contar», el total es un mínimo y se marca como tal."
        />
        <StatTile
          size="lg"
          label="Horas de grabación"
          value={totals.measured === 0 ? "--" : formatWorkTime(totals.recordMinutes)}
        />
      </div>

      <ChartFrame
        title="Dónde se atasca"
        question="Piezas en cada estado, en el orden del proceso."
        hint="El orden es el del proceso y no el del recuento: aquí la posición significa algo -- es el embudo -- y reordenarlo por tamaño lo destruiría. Un montón en «Falta editar» y nada en «Falta grabar» dice dónde está el tapón."
        empty={pieces.length === 0}
        emptyLabel="Apunta alguna pieza y aquí verás el embudo."
      >
        <BarSeries data={stages} colorToken="--mod-content" height={240} />
      </ChartFrame>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Por canal"
          question="En cuántas piezas aparece cada canal."
          empty={channels.length === 0}
          emptyLabel="Pon canal a tus piezas."
        >
          <RankSeries
            data={channels}
            colorToken="--mod-content"
            height={Math.max(150, channels.length * 34 + 40)}
          />
        </ChartFrame>

        <ChartFrame
          title="Por plataforma"
          question="Dónde acaba publicándose lo que haces."
          empty={platforms.length === 0}
          emptyLabel="Pon plataforma a tus piezas."
        >
          <RankSeries
            data={platforms}
            colorToken="--mod-content"
            height={Math.max(150, platforms.length * 34 + 40)}
          />
        </ChartFrame>
      </div>

      <ChartFrame
        title="Qué formato sale caro"
        question="Horas de edición acumuladas por tipo de edición."
        hint="Una pieza con dos estilos suma sus horas a los dos: la pregunta es cuánto cuesta cada formato, no cómo repartir un presupuesto. Los tiempos «dejé de contar» entran con su suelo, así que el resultado se queda corto antes que pasarse."
        empty={styles.length === 0}
        emptyLabel="Apunta el tiempo y el tipo de edición de unas cuantas piezas."
      >
        <RankSeries
          data={styles}
          colorToken="--mod-content"
          unit="h"
          height={Math.max(150, styles.length * 34 + 40)}
        />
      </ChartFrame>

      <ChartFrame
        title="Cuánto publicas"
        question="Piezas publicadas cada mes."
        hint="Por mes y no por día: publicar no es diario, y una serie diaria serían treinta ceros y dos barras, de donde no se lee ninguna tendencia."
        empty={monthly.length === 0}
        emptyLabel="Todavía no has publicado nada."
      >
        <BarSeries data={monthly} colorToken="--mod-content" height={220} />
      </ChartFrame>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lo más atrasado</CardTitle>
          <CardDescription>
            Días desde la fecha prevista, para las que siguen sin publicar. Es la única fecha que
            tiene una pieza atascada, y ningún otro campo lo dice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {late.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada atrasado. Todo lo previsto va a tiempo.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {late.map((piece) => (
                <li key={piece.title} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <span className="text-sm">{piece.title}</span>
                  <span className="text-xs text-muted-foreground">{STATUS_LABELS[piece.status]}</span>
                  <span className="ml-auto shrink-0 text-sm tabular-nums text-negative">
                    {piece.days} días
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
