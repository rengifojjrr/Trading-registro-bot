import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { formatSleepDuration, summarise } from "@/modules/sleep/domain/sleep";
import { fetchSleepEntries } from "@/modules/sleep/queries";
import { SleepForm } from "@/modules/sleep/ui/sleep-form";
import { SleepHistory } from "@/modules/sleep/ui/sleep-history";

/**
 * Sueño.
 *
 * La media de arriba es literalmente el número que hoy no existe: en Notion
 * la duración se guardaba como texto en una lista de opciones, así que no
 * había forma de promediarla. Aquí sale de restar dos instantes.
 */
export default async function SleepPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const entries = await fetchSleepEntries();

  const last30 = entries.slice(0, 30);
  const stat = summarise(
    last30.map((e) => ({ durationMinutes: e.duration_minutes, score: e.score })),
  );
  const tonight = entries.find((e) => e.sleep_date === today) ?? null;

  return (
    <>
      <PageHeader
        title="Sueño"
        description="Cuánto duermes de verdad, cómo te levantas y qué soñaste."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile
          size="lg"
          label="Media de sueño"
          value={formatSleepDuration(stat.averageMinutes)}
          sub={`últimas ${last30.length} noches`}
          description="Se calcula restando la hora a la que te acostaste de la hora a la que te levantaste. Las noches sin registrar se ignoran en lugar de contar como cero."
        />
        <StatTile
          size="lg"
          label="Puntaje medio"
          value={stat.averageScore === null ? "--" : `${stat.averageScore}/10`}
          sub="cómo la valoraste"
        />
        <StatTile
          size="lg"
          label="Anoche"
          value={formatSleepDuration(tonight?.duration_minutes ?? null)}
          sub={tonight ? "registrada" : "sin registrar"}
          tone={tonight ? "neutral" : "neutral"}
        />
      </div>

      <SleepForm date={today} entry={tonight} timezone={timezone} />

      <SleepHistory entries={entries} timezone={timezone} />
    </>
  );
}
