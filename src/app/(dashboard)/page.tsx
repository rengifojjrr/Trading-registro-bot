import { ModuleCard } from "@/components/vida/module-card";
import { QuickLog } from "@/components/vida/quick-log";
import { formatModuleValue } from "@/core/format-metrics";
import { readDayMetrics } from "@/core/metrics";
import { MODULES } from "@/core/registry";
import { longDateLabel, todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Hoy.
 *
 * Deliberadamente no es un menú. Un menú es una pantalla que hay que
 * atravesar para llegar a lo que ibas a hacer; lo que se hace a diario es
 * registrar en cinco segundos, así que el registro rápido va antes que
 * cualquier cifra y las tarjetas están debajo, para consultar.
 *
 * Sólo lee core_daily_metrics. No importa de ningún módulo -- si lo hiciera,
 * esta pantalla sería el punto por el que los siete se acoplan y la promesa
 * de poder arrancar uno dejaría de ser cierta.
 */
export default async function TodayPage() {
  const user = await requireUser();
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const metrics = await readDayMetrics(today);

  const firstName = (user.email ?? "").split("@")[0];
  const greeting = firstName ? `Hola, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}` : "Hola";

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
        <p className="text-sm text-muted-foreground">{longDateLabel(today)}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Registrar</h2>
        <QuickLog />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tu día</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} value={formatModuleValue(module.id, metrics)} />
          ))}
        </div>
      </section>
    </>
  );
}
