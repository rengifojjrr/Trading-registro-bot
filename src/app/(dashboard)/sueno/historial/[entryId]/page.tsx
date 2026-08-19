import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEntityExtras } from "@/core/entity-extras";
import { DetailShell } from "@/core/ui/detail-shell";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { clockFromTimestamp, formatSleepDuration } from "@/modules/sleep/domain/sleep";
import { fetchSleepEntry } from "@/modules/sleep/queries";
import { SleepWizard } from "@/modules/sleep/ui/sleep-wizard";

/**
 * La ficha de una noche.
 *
 * Guardar ya corregía por fecha desde el principio -- una noche por día, y
 * volver a guardarla la reescribe -- pero no había puerta: desde el historial
 * no se podía volver a abrir ninguna, y el asistente siempre partía de la de
 * hoy.
 *
 * Se reutiliza el asistente entero en lugar de escribir un formulario plano.
 * Es el mismo trabajo, sabe editar desde que existe, y así corregir una noche
 * de hace un mes se hace exactamente igual que apuntar la de anoche.
 */
export default async function SleepEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;

  const entry = await fetchSleepEntry(entryId);
  if (!entry) notFound();

  const [timezone, extras] = await Promise.all([
    userTimezone(),
    fetchEntityExtras("SUENO", entry.id),
  ]);

  const bedtime = clockFromTimestamp(entry.slept_at, timezone);
  const wake = clockFromTimestamp(entry.woke_at, timezone);

  const subtitle = [
    formatSleepDuration(entry.duration_minutes),
    bedtime && wake ? `de ${bedtime} a ${wake}` : null,
    entry.score !== null ? `${entry.score}/10` : null,
    entry.place,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="SUENO"
      entityId={entry.id}
      path={`/sueno/historial/${entry.id}`}
      backHref="/sueno/historial"
      backLabel="Historial de sueño"
      icon={entry.icon}
      title={formatDate(`${entry.sleep_date}T00:00:00Z`, timezone)}
      subtitle={subtitle}
      colorToken="--mod-sleep"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">La noche</CardTitle>
        </CardHeader>
        <CardContent>
          <SleepWizard date={entry.sleep_date} entry={entry} timezone={timezone} />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
