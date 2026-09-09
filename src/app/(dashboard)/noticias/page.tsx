import { CalendarOff } from "lucide-react";
import { DateTime } from "luxon";
import type { Route } from "next";
import Link from "next/link";

import { EventAgenda } from "@/components/economic-calendar/event-agenda";
import { NextEventCard } from "@/components/economic-calendar/next-event-card";
import { RefreshCalendar } from "@/components/economic-calendar/refresh-calendar";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { pickSearchParam } from "@/lib/analytics/filter-params";
import { fetchOpenLivePositions } from "@/lib/analytics/queries";
import { requireUser } from "@/lib/auth/require-user";
import {
  fetchEventsBetween,
  fetchIndicatorHistory,
  fetchNextKeyEvent,
} from "@/lib/economic-calendar/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Noticias: qué se publica, cuándo, y qué tienes abierto cuando salga.
 *
 * Operar futuros apalancados sin saber que el IPC sale en veinte minutos es la
 * clase de sorpresa que acaba en liquidación. La aplicación ya sabía tu
 * posición; aquí aprende qué viene, y lo interesante es ponerlas juntas.
 *
 * Todo sale de `economic_events`, nunca de la fuente en directo: una pantalla
 * que depende de que un tercero responda es una pantalla que a veces no carga.
 * El refresco lo pide `RefreshCalendar` por detrás, después de pintar.
 */

/** Cuántos días hacia delante enseña la agenda. */
const DIAS_AGENDA = 14;

export default async function NoticiasPage(props: PageProps<"/noticias">) {
  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const timezone = settings?.timezone || "UTC";

  // Por defecto se esconde lo de impacto bajo: son subastas de letras e
  // inventarios de crudo, cuarenta filas al día que entierran las tres que
  // importan. Enseñarlo todo es una opción, no lo que se ve al entrar.
  const verTodo = pickSearchParam(searchParams.filtro) === "todo";

  const now = new Date();
  // Desde el principio de hoy *en tu zona*, para que lo ya publicado hoy siga
  // a la vista: saber que el dato salió y en cuánto sorprendió importa tanto
  // como saber que viene.
  const desde = DateTime.now().setZone(timezone).startOf("day").toJSDate();
  const hasta = DateTime.now().setZone(timezone).plus({ days: DIAS_AGENDA }).endOf("day").toJSDate();

  const [events, next, openPositions] = await Promise.all([
    fetchEventsBetween({ from: desde, to: hasta, minImportance: verTodo ? -1 : 0 }),
    fetchNextKeyEvent(now),
    // Nunca tumba la página: sin Coinbase configurado el calendario sigue
    // siendo útil, sólo pierde el aviso de posición.
    fetchOpenLivePositions().catch(() => []),
  ]);

  const history =
    next?.indicator !== undefined && next?.indicator !== null
      ? await fetchIndicatorHistory({ indicator: next.indicator, before: new Date(next.occursAt) })
      : [];

  const openContracts = openPositions.reduce(
    (sum, p) => sum + (Number(p.total_entry_qty) - Number(p.total_exit_qty)),
    0,
  );

  return (
    <>
      <PageHeader
        title="Noticias"
        description="Datos macroeconómicos de Estados Unidos: cuándo se publican, qué se espera y qué salió."
      />

      {/* Pide el refresco después de pintar, no antes: la página ya tiene lo
          que necesita guardado, y esperar a una petición externa para enseñar
          algo es cómo se hace una pantalla que a veces no carga. */}
      <RefreshCalendar />

      {next ? (
        <NextEventCard
          event={next}
          history={history}
          timezone={timezone}
          openContracts={openContracts}
        />
      ) : null}

      <div className="flex items-center gap-2 text-sm">
        <FiltroLink href={"/noticias" as Route} activo={!verTodo}>
          Lo que importa
        </FiltroLink>
        <FiltroLink href={"/noticias?filtro=todo" as Route} activo={verTodo}>
          Todo
        </FiltroLink>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="Todavía no hay eventos guardados"
          description="El calendario se está trayendo por primera vez. La primera carga baja algo más de un año de publicaciones, así que puede tardar unos segundos; recarga en un momento."
        />
      ) : (
        <EventAgenda events={events} timezone={timezone} now={now} />
      )}

      <p className="text-xs text-muted-foreground">
        Horas en tu zona ({timezone}). El nivel de impacto y las previsiones vienen del calendario
        económico de TradingView; el dato real aparece cuando el organismo lo publica. Nada de esto
        predice el precio de Bitcoin: dice qué se publica y cuándo.
      </p>
    </>
  );
}

function FiltroLink({
  href,
  activo,
  children,
}: {
  href: Route;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        activo
          ? "border-border bg-secondary text-secondary-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
