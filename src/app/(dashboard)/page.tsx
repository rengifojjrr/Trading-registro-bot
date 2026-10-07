import { BellPlus } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LifeCalendar } from "@/components/vida/life-calendar";
import { ModuleCard } from "@/components/vida/module-card";
import { PendingPanel } from "@/components/vida/pending-panel";
import { QuickLogSheet } from "@/components/vida/quick-log-sheet";
import { monthGrid, monthOf } from "@/core/calendar";
import { fetchMarkers } from "@/core/day";
import { formatModuleValue } from "@/core/format-metrics";
import { readDayMetrics } from "@/core/metrics";
import { MODULES } from "@/core/registry";
import { longDateLabel, todayIn } from "@/core/today";
import { fetchNowReminders } from "@/core/reminders/queries";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { gatherPending } from "@/lib/pending/gather";
import { readSystemHealth } from "@/lib/pending/setup";
import { SetupPanel } from "@/components/vida/setup-panel";
import { fetchOrderContext, fetchProjectsOverview } from "@/modules/tasks/project-queries";
import { fetchTasks } from "@/modules/tasks/queries";
import { NowPanel, type NowTask } from "@/modules/tasks/ui/now-panel";
import { ProjectsCarousel } from "@/modules/tasks/ui/projects/projects-carousel";
import { QuickOrder } from "@/modules/tasks/ui/quick-order";
import { WhatsAppTile } from "@/components/vida/whatsapp-tile";

import { quickLogReading, quickLogSleep } from "./quick-log-actions";

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
 * Lee `core_daily_metrics` para las tarjetas y las marcas del calendario desde
 * `core/day`, que consulta las tablas por su nombre. La única excepción es
 * Tareas, a propósito: desde E2 los proyectos son la portada (la orden rápida,
 * «Ahora» y el carrusel), que es la prioridad del dueño. Lo demás de los
 * módulos sigue sin entrar aquí.
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
  const [metrics, markers, pending, health, ahora, tareas, proyectos, orden] = await Promise.all([
    readDayMetrics(today),
    grid.length > 0
      ? fetchMarkers(grid[0].date, grid[grid.length - 1].date)
      : Promise.resolve(new Map()),
    // Lo pendiente estaba repartido entre Actividad, Diario, Conciliación y el
    // Panel: cada sitio contestaba su parte y ninguno contestaba «¿qué me
    // falta?», que es la pregunta que se hace al abrir la aplicación.
    gatherPending(),
    // Lo que falta por configurar el primer día, y si sigue funcionando
    // cualquier otro. Es la misma lista mirada en dos momentos.
    readSystemHealth(),
    // «Ahora»: lo que suena hoy y lo que vence hoy. Cada fuente por su lado:
    // si una falla, la portada sale igual.
    fetchNowReminders().catch(() => ({ items: [], timezone })),
    fetchTasks().catch(() => []),
    fetchProjectsOverview().catch(() => null),
    fetchOrderContext().catch(() => ({ projects: [], people: [], members: [] })),
  ]);

  const deHoy: NowTask[] = tareas
    .filter((t) => t.mine && t.parent_id === null && t.status !== "HECHA" && t.due_date === today)
    .map((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.projectName,
      projectColor: t.projectColor,
      time: t.due_time ? t.due_time.slice(0, 5) : null,
      status: t.status === "EN_CURSO" ? ("EN_CURSO" as const) : ("NO_INICIADA" as const),
    }))
    .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));

  const firstName = (user.email ?? "").split("@")[0];
  const greeting = firstName ? `Hola, ${firstName.charAt(0).toUpperCase()}${firstName.slice(1)}` : "Hola";

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
        <p className="text-sm text-muted-foreground">{longDateLabel(today)}</p>
      </header>

      {/* La orden rápida, sin IA: «en petróleo agrega…», «recuérdame…». */}
      <QuickOrder ctx={{ tz: timezone, projects: orden.projects, people: orden.people, members: orden.members }} />

      {/* Va después de registrar y antes de las cifras: lo que hay que hacer
          pesa más que lo que hay que mirar, pero registrar en cinco segundos
          sigue siendo lo primero. */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Registrar</h2>
          <Link
            href="/tareas/recordatorios?nuevo=1"
            className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <BellPlus className="size-4" aria-hidden /> Recordatorio
          </Link>
        </div>
        {/* Los dos que caben en un número se apuntan aquí mismo; los demás
            siguen llevando a su pantalla, que es donde tienen sentido. */}
        <QuickLogSheet acciones={{ sueno: quickLogSleep, lectura: quickLogReading }} />
      </section>

      {ahora.items.length > 0 || deHoy.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Ahora</h2>
          <NowPanel reminders={ahora.items} tasks={deHoy} tz={timezone} />
        </section>
      ) : null}

      <SetupPanel health={health} />

      {pending.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Te está esperando</h2>
          <PendingPanel items={pending} />
        </section>
      ) : null}

      {proyectos ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Proyectos</h2>
            <Link href="/tareas/proyectos" className="flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
              Ver todos
            </Link>
          </div>
          <ProjectsCarousel cards={proyectos.cards} today={proyectos.today} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tu día</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} value={formatModuleValue(module.id, metrics)} />
          ))}
          {/* El bot de WhatsApp: sólo cifras y si da señales (el puente, E4). */}
          <WhatsAppTile />
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
