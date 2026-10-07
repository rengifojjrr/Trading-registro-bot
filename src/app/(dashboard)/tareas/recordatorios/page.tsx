import { PageHeader } from "@/components/layout/page-header";
import { PushToggle } from "@/components/settings/push-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isUuid } from "@/core/ids";
import { fetchReminderTargets, fetchRemindersOverview } from "@/core/reminders/queries";
import { ReminderList } from "@/core/reminders/ui/reminder-list";
import { appOrigin } from "@/lib/app-url";
import { ensureVapidKeys } from "@/lib/push/keys";

/**
 * Recordatorios: lo que suena en el teléfono aunque la Mac duerma.
 *
 * El reloj está en la base (pg_cron cada minuto): esta pantalla sólo los crea,
 * los cambia y enseña cuándo suenan, que también lo dice la base. Arriba, si
 * este teléfono no tiene los avisos activados, el botón para activarlos: sin
 * eso los recordatorios sólo se ven aquí, en Hoy y en la campana.
 */
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const focusId = typeof query.r === "string" && isUuid(query.r) ? query.r : null;
  const nuevo = query.nuevo === "1";
  const proyecto = typeof query.proyecto === "string" && isUuid(query.proyecto) ? query.proyecto : null;

  const [datos, targets, claves] = await Promise.all([
    fetchRemindersOverview(),
    fetchReminderTargets(),
    appOrigin().then((o) => ensureVapidKeys(o)),
  ]);

  return (
    <>
      <PageHeader
        title="Recordatorios"
        description="Suenan en el teléfono aunque tu Mac esté dormida. «Hecho» o «En 1 h» desde el aviso."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Que suene en este teléfono</CardTitle>
          <CardDescription>
            Se activa en cada aparato. De 22:00 a 07:00 no suena nada, salvo lo que tenga esa hora puesta por ti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PushToggle publicKey={claves?.publica ?? null} />
        </CardContent>
      </Card>

      <ReminderList
        reminders={datos.reminders}
        fires={datos.fires}
        now={datos.now}
        tz={datos.timezone}
        today={datos.today}
        targets={{ projects: targets.projects, people: targets.people }}
        focusId={focusId}
        openNew={nuevo}
        newProjectId={proyecto}
      />
    </>
  );
}
