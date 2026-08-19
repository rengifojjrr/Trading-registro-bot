import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { userTimezone } from "@/core/user-settings";
import { formatSleepDuration, summarise } from "@/modules/sleep/domain/sleep";
import { bedtimeSpread } from "@/modules/sleep/domain/sleep-analysis";
import { fetchSleepEntries } from "@/modules/sleep/queries";
import { SleepHistory } from "@/modules/sleep/ui/sleep-history";

/**
 * Sueño: historial.
 *
 * Aquí se viene a releer, no a contar: los sueños narrados salen enteros y en
 * orden. Las tres cifras de arriba están porque son las que uno mira de paso
 * antes de ponerse a leer.
 */
export default async function SleepHistoryPage() {
  const timezone = await userTimezone();
  const entries = await fetchSleepEntries(200);

  const last30 = entries.slice(0, 30);
  const stat = summarise(last30.map((e) => ({ durationMinutes: e.duration_minutes, score: e.score })));
  const spread = bedtimeSpread(
    last30.map((e) => ({
      sleepDate: e.sleep_date,
      sleptAt: e.slept_at,
      wokeAt: e.woke_at,
      durationMinutes: e.duration_minutes,
      score: e.score,
      beforeBed: e.before_bed,
    })),
    timezone,
  );

  return (
    <>
      <PageHeader
        title="Historial de sueño"
        description="Todas las noches registradas, la más reciente primero."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          label="Variación al acostarte"
          value={spread === null ? "--" : `±${formatSleepDuration(spread)}`}
          sub="lo regular que eres"
          description="Desviación típica de la hora a la que te acuestas. Se puede dormir ocho horas de media acostándose a las diez un día y a las tres el siguiente; la media no lo delata y esta cifra sí."
        />
        <StatTile size="lg" label="Noches registradas" value={String(entries.length)} sub="en total" />
      </div>

      <SleepHistory entries={entries} timezone={timezone} />
    </>
  );
}
