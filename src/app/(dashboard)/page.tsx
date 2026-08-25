import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeCalendar } from "@/components/vida/life-calendar";
import { ModuleCard } from "@/components/vida/module-card";
import { PendingPanel } from "@/components/vida/pending-panel";
import { QuickLog } from "@/components/vida/quick-log";
import { monthGrid, monthOf } from "@/core/calendar";
import { fetchMarkers } from "@/core/day";
import { formatModuleValue } from "@/core/format-metrics";
import { readDayMetrics } from "@/core/metrics";
import { MODULES } from "@/core/registry";
import { longDateLabel, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { gatherPending } from "@/lib/pending/gather";

/**
 * Hoy.
 *
 * Deliberadamente no es un menú. Un menú es una pantalla que hay que
 * atravesar para llegar a lo que ibas a hacer; lo que se hace a diario es
 * registrar en cinco segundos, así que el registro rápido va antes que
 * cualquier cifra y las tarjetas están debajo, para consultar.
 *
 * El calendario va el último y a propósito: responde «cómo va la semana», que
 * es una pregunta de repaso, no de registro. Ponerlo arriba convertiría la
 * pantalla de hacer en una de mirar.
 *
 * Esta página no importa ningún módulo -- lee `core_daily_metrics` para las
 * tarjetas y las marcas del calendario desde `core/day`, que consulta las
 * tablas por su nombre. Si importara uno, esta pantalla sería el punto por el
 * que los siete se acoplan y la promesa de poder arrancar uno dejaría de ser
 * cierta.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;

  const user = await requireUser();
  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const month = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : monthOf(today);

  // El rango cubre las semanas completas que pinta la rejilla, incluidos los
  // días de relleno del mes anterior y el siguiente: si no, esos días
  // saldrían siempre vacíos aunque tuvieran cosas.
  const grid = monthGrid(month).flat();
  const [metrics, markers, pending] = await Promise.all([
    readDayMetrics(today),
    grid.length > 0
      ? fetchMarkers(grid[0].date, grid[grid.length - 1].date)
      : Promise.resolve(new Map()),
    // Lo pendiente estaba repartido entre Actividad, Diario, Conciliación y el
    // Panel: cada sitio contestaba su parte y ninguno contestaba «¿qué me
    // falta?», que es la pregunta que se hace al abrir la aplicación.
    gatherPending(),
  ]);

  const firstName = (user.email ?? "").split("@")[0];
  const greeting = firstName ? `Hola, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}` : "Hola";

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
        <p className="text-sm text-muted-foreground">{longDateLabel(today)}</p>
      </header>

      {/* Va después de registrar y antes de las cifras: lo que hay que hacer
          pesa más que lo que hay que mirar, pero registrar en cinco segundos
          sigue siendo lo primero. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Registrar</h2>
        <QuickLog />
      </section>

      {pending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Te está esperando</h2>
          <PendingPanel items={pending} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tu día</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} value={formatModuleValue(module.id, metrics)} />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">El mes</CardTitle>
          <CardDescription>
            Un punto por módulo con algo ese día. Pulsa un día para ver todo lo que registraste.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LifeCalendar month={month} today={today} markers={markers} />
        </CardContent>
      </Card>
    </>
  );
}
