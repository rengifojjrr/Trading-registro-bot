import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatClockHours } from "@/core/clock";
import { ChartFrame } from "@/core/ui/chart-frame";
import { BarSeries, DeltaRanks, MultiLineSeries, ScatterPlot } from "@/core/ui/charts";
import { userTimezone } from "@/core/user-settings";
import { formatSleepDuration, summarise } from "@/modules/sleep/domain/sleep";
import {
  bedtimeSpread,
  durationSeries,
  durationVsScore,
  scheduleSeries,
  tagEffects,
  type AnalysableNight,
} from "@/modules/sleep/domain/sleep-analysis";
import { fetchSleepEntries } from "@/modules/sleep/queries";

const NIGHTS = 60;

/**
 * Sueño: análisis.
 *
 * Cuatro gráficas y cada una responde una pregunta distinta, que es el
 * criterio por el que están: cuánto duermes, a qué hora, si dormir más te
 * sienta mejor, y qué costumbre acompaña a tus mejores noches. Una quinta
 * gráfica que repitiera lo mismo con otra forma sobraría.
 *
 * Nada de esto existía en Notion, y no por falta de ganas: la duración se
 * guardaba como texto en una lista de opciones («8 horas», «+8 horas»), y con
 * eso no se puede promediar, ni ordenar, ni cruzar con nada.
 */
export default async function SleepAnalysisPage() {
  const timezone = await userTimezone();
  const rows = await fetchSleepEntries(NIGHTS);

  const nights: AnalysableNight[] = rows.map((row) => ({
    sleepDate: row.sleep_date,
    sleptAt: row.slept_at,
    wokeAt: row.woke_at,
    durationMinutes: row.duration_minutes,
    score: row.score,
    beforeBed: row.before_bed,
  }));

  const stat = summarise(nights.map((n) => ({ durationMinutes: n.durationMinutes, score: n.score })));
  const spread = bedtimeSpread(nights, timezone);

  const duration = durationSeries(nights);
  const averageHours =
    stat.averageMinutes === null ? null : Math.round((stat.averageMinutes / 60) * 10) / 10;

  const { bedtime, wake } = scheduleSeries(nights, timezone);
  // Las dos series comparten eje, así que se juntan por etiqueta de día. Una
  // noche a la que le falte una de las dos horas deja un hueco en su línea en
  // lugar de un cero, que sería «me levanté a medianoche».
  const scheduleRows = [...new Set([...bedtime, ...wake].map((p) => p.label))].map((label) => ({
    label,
    acostarse: bedtime.find((p) => p.label === label)?.value ?? null,
    levantarse: wake.find((p) => p.label === label)?.value ?? null,
  }));

  const scatter = durationVsScore(nights);
  const effects = tagEffects(nights);

  return (
    <>
      <PageHeader
        title="Análisis del sueño"
        description={`Las últimas ${nights.length} noches registradas.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          size="lg"
          label="Media de sueño"
          value={formatSleepDuration(stat.averageMinutes)}
          sub={`${duration.length} noches medidas`}
        />
        <StatTile
          size="lg"
          label="Puntaje medio"
          value={stat.averageScore === null ? "--" : `${stat.averageScore}/10`}
          sub="cómo las valoraste"
        />
        <StatTile
          size="lg"
          label="Te acuestas hacia"
          value={
            bedtime.length === 0
              ? "--"
              : formatClockHours(bedtime.reduce((sum, p) => sum + p.value, 0) / bedtime.length)
          }
          sub="de media"
        />
        <StatTile
          size="lg"
          label="Variación"
          value={spread === null ? "--" : `±${formatSleepDuration(spread)}`}
          sub="al acostarte"
          description="Desviación típica de la hora a la que te acuestas. Cuanto más baja, más horario tienes."
        />
      </div>

      <ChartFrame
        title="Cuánto dormiste cada noche"
        question="En horas. La línea punteada es tu media."
        empty={duration.length === 0}
        emptyLabel="Registra un par de noches con sus dos horas y esta gráfica aparece."
      >
        <BarSeries data={duration} colorToken="--mod-sleep" average={averageHours} unit="h" height={240} />
      </ChartFrame>

      <ChartFrame
        title="A qué hora te acuestas y te levantas"
        question="Lo que importa aquí es lo planas que estén las dos líneas: eso es tener horario."
        hint="La madrugada se cuenta como 24, 25, 26 en lugar de volver a 0. Si no, acostarse a las 23:30 una noche y a las 00:30 la siguiente dibujaría una caída de veintitrés horas donde en realidad hay una."
        empty={scheduleRows.length === 0}
        emptyLabel="Hacen falta noches con hora de acostarse y de levantarse."
      >
        <MultiLineSeries
          data={scheduleRows}
          format="clock"
          height={260}
          series={[
            { key: "acostarse", label: "Me acosté", colorToken: "--mod-sleep" },
            { key: "levantarse", label: "Me levanté", colorToken: "--mod-reading" },
          ]}
        />
      </ChartFrame>

      <ChartFrame
        title="¿Dormir más te hace valorar mejor la noche?"
        question="Cada punto es una noche: horas dormidas contra el puntaje que le pusiste."
        hint="Si los puntos suben hacia la derecha, las horas te arreglan la noche. Si salen desperdigados, lo que te la arregla es otra cosa -- y eso también es una respuesta."
        empty={scatter.length < 3}
        emptyLabel="Hacen falta al menos tres noches con duración y puntaje."
      >
        <ScatterPlot
          data={scatter}
          colorToken="--mod-sleep"
          xLabel="Horas dormidas"
          yLabel="Puntaje"
          height={260}
        />
      </ChartFrame>

      <ChartFrame
        title="Qué costumbre acompaña a tus mejores noches"
        question="Minutos de más o de menos frente a tu media, según lo que hiciste antes de dormir."
        hint="Sólo aparecen las costumbres con tres noches o más: con una sola, la diferencia es ruido con aspecto de conclusión. Y es coincidencia, no causa -- trasnochar y dormir poco salen juntos porque son la misma noche."
        empty={effects.length === 0}
        emptyLabel="Marca qué haces antes de dormir durante unas cuantas noches y esto se llena solo."
      >
        <DeltaRanks
          data={effects.map((e) => ({
            label: e.tag,
            value: e.deltaMinutes,
            note: `${e.nights} noches · ${formatSleepDuration(e.averageMinutes)} de media`,
          }))}
          unit="min"
          height={Math.max(200, effects.length * 34 + 40)}
        />
      </ChartFrame>
    </>
  );
}
