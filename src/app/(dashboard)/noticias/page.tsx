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
  fetchCategoriesBetween,
  fetchEventsBetween,
  fetchIndicatorHistory,
  fetchNextKeyEvent,
} from "@/lib/economic-calendar/queries";
import { categoryLabel } from "@/lib/economic-calendar/relevance";
import type { EventImportance } from "@/lib/economic-calendar/types";
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

/**
 * Los niveles del filtro.
 *
 * «Importantes» es el de entrada y agrupa alto y medio; los tres niveles
 * sueltos están porque no es lo mismo preparar la semana -- donde sólo
 * interesa lo grande -- que buscar por qué se movió el precio a una hora rara,
 * donde hace falta ver hasta lo pequeño.
 */
const NIVELES = {
  importantes: { label: "Importantes", min: 0 as EventImportance, exact: undefined },
  alto: { label: "Alto", min: undefined, exact: 1 as EventImportance },
  medio: { label: "Medio", min: undefined, exact: 0 as EventImportance },
  bajo: { label: "Bajo", min: undefined, exact: -1 as EventImportance },
  todo: { label: "Todo", min: undefined, exact: undefined },
} as const;

type NivelKey = keyof typeof NIVELES;

function esNivel(value: string | undefined): value is NivelKey {
  return value !== undefined && value in NIVELES;
}

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

  const nivelParam = pickSearchParam(searchParams.nivel);
  const nivel: NivelKey = esNivel(nivelParam) ? nivelParam : "importantes";
  const categoria = pickSearchParam(searchParams.cat) || null;

  const now = new Date();
  // Desde el principio de hoy *en tu zona*, para que lo ya publicado hoy siga
  // a la vista: saber que el dato salió y en cuánto sorprendió importa tanto
  // como saber que viene.
  const desde = DateTime.now().setZone(timezone).startOf("day").toJSDate();
  const hasta = DateTime.now().setZone(timezone).plus({ days: DIAS_AGENDA }).endOf("day").toJSDate();

  const [events, next, openPositions, categorias] = await Promise.all([
    fetchEventsBetween({
      from: desde,
      to: hasta,
      minImportance: NIVELES[nivel].min,
      exactImportance: NIVELES[nivel].exact,
      category: categoria ?? undefined,
    }),
    fetchNextKeyEvent(now),
    // Nunca tumba la página: sin Coinbase configurado el calendario sigue
    // siendo útil, sólo pierde el aviso de posición.
    fetchOpenLivePositions().catch(() => []),
    // Las categorías se calculan sobre todo lo de la ventana, no sobre el
    // nivel filtrado: si dependieran del nivel, elegir una categoría podría
    // hacer desaparecer el chip que acabas de pulsar.
    fetchCategoriesBetween({ from: desde, to: hasta }).catch(() => []),
  ]);

  const history =
    next?.indicator !== undefined && next?.indicator !== null
      ? await fetchIndicatorHistory({ indicator: next.indicator, before: new Date(next.occursAt) })
      : [];

  const openContracts = openPositions.reduce(
    (sum, p) => sum + (Number(p.total_entry_qty) - Number(p.total_exit_qty)),
    0,
  );

  /** Conserva el otro filtro al cambiar uno: son dos ejes, no una lista de opciones. */
  const href = (cambio: { nivel?: NivelKey; cat?: string | null }): Route => {
    const params = new URLSearchParams();
    const nivelFinal = cambio.nivel ?? nivel;
    const catFinal = cambio.cat === undefined ? categoria : cambio.cat;
    if (nivelFinal !== "importantes") params.set("nivel", nivelFinal);
    if (catFinal) params.set("cat", catFinal);
    const query = params.toString();
    return (query ? `/noticias?${query}` : "/noticias") as Route;
  };

  return (
    <>
      <PageHeader
        title="Noticias"
        description="Datos macroeconómicos de Estados Unidos: cuándo se publican, qué se espera y qué salió. Entra en cualquiera para ver qué mide y cómo reaccionó el precio las veces anteriores."
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

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Impacto</span>
          {(Object.keys(NIVELES) as NivelKey[]).map((key) => (
            <Chip key={key} href={href({ nivel: key })} activo={nivel === key}>
              {NIVELES[key].label}
            </Chip>
          ))}
        </div>

        {categorias.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Tema</span>
            <Chip href={href({ cat: null })} activo={categoria === null}>
              Todos
            </Chip>
            {categorias.map((cat) => {
              const label = categoryLabel(cat);
              if (!label) return null;
              return (
                <Chip key={cat} href={href({ cat })} activo={categoria === cat}>
                  {label}
                </Chip>
              );
            })}
          </div>
        ) : null}
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="Nada que enseñar con estos filtros"
          description="No hay publicaciones de ese impacto y ese tema en los próximos catorce días. Prueba a ampliar el filtro de impacto."
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

function Chip({
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
