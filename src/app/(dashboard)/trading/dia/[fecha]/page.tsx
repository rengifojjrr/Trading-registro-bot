import { CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";

import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RememberList } from "@/components/shared/remember-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAccounts, fetchTradesForDay, type TradeTableRow } from "@/lib/analytics/queries";
import {
  countOutcomes,
  splitTradingDay,
  sumNetPnl,
  tradingDayWindow,
} from "@/lib/analytics/trading-day";
import { requireUser } from "@/lib/auth/require-user";
import { longDateLabel, shiftDate, todayIn } from "@/core/today";
import {
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSessionLabel,
  formatSignedMoney,
  pnlColorClass,
  pnlTone,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * Lo que operaste un día.
 *
 * El calendario de P&L llevaba a `/dia/[fecha]`, la ficha de la vida entera --
 * la misma que abre el calendario de la pantalla de inicio. Dos calendarios
 * distintos acababan en la misma pantalla, y esa pantalla busca las operaciones
 * por hora de apertura mientras que el calendario las reparte por hora de
 * cierre: pulsabas un día con ocho operaciones y te encontrabas «este día no
 * tiene nada registrado», con la única salida de vuelta al inicio de la
 * aplicación.
 *
 * Esta es la ficha del día **de trading**, y sólo de trading: se vuelve al
 * panel con los filtros que traías, y desde cada operación se entra a su ficha.
 * La otra sigue existiendo, con su enlace al final: son dos preguntas
 * distintas -- «qué operé el martes» y «qué hice el martes».
 */
export default async function TradingDayPage(props: PageProps<"/trading/dia/[fecha]">) {
  const { fecha } = await props.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();

  const user = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;

  const [{ data: settings }, accounts] = await Promise.all([
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
  ]);

  const timezone = settings?.timezone || "UTC";
  const currency = accounts[0]?.currency ?? "USD";

  const window = tradingDayWindow(fecha, timezone);
  const { closed, opened } = splitTradingDay(await fetchTradesForDay(window.from, window.to), window);

  const netPnl = sumNetPnl(closed);
  const outcomes = countOutcomes(closed);
  const commissions = closed
    .concat(opened)
    .reduce((total, t) => total + Number(t.total_commissions ?? 0), 0);

  const today = todayIn(timezone);

  // Volver donde estabas: el calendario arrastra sus filtros y su mes en la
  // dirección, así que la vuelta los devuelve intactos en vez de dejar el
  // panel recién puesto a cero.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value !== "string" || value.length === 0) continue;
    query.set(key, value);
  }
  const queryString = query.toString();
  const panelHref = queryString ? `/trading?${queryString}` : "/trading";
  const dayHref = (date: string) =>
    (queryString ? `/trading/dia/${date}?${queryString}` : `/trading/dia/${date}`) as Route;

  const empty = closed.length === 0 && opened.length === 0;

  return (
    <>
      {/* Desde una operación, «volver» tiene que traer aquí y no a la lista
          general: se entra a cinco operaciones seguidas del mismo día. */}
      <RememberList
        href={dayHref(fecha)}
        label={`Volver al ${DateTime.fromISO(fecha).setLocale("es").toFormat("d 'de' LLLL")}`}
      />

      <div className="flex flex-col gap-3">
        <Link
          href={panelHref as Route}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Volver al panel de trading
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <PageHeader
            title={fecha === today ? "Hoy" : longDateLabel(fecha)}
            description={
              empty
                ? "Ese día no operaste."
                : "Las operaciones de este día. El total es el de la celda del calendario."
            }
          />

          <div className="ml-auto flex items-center gap-2">
            <Link
              href={dayHref(shiftDate(fecha, -1))}
              aria-label="Día anterior"
              className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
            {fecha !== today ? (
              <Link
                href={dayHref(today)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Hoy
              </Link>
            ) : null}
            <Link
              href={dayHref(shiftDate(fecha, 1))}
              aria-label="Día siguiente"
              className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {empty ? (
        <EmptyState
          icon={CalendarOff}
          title="Ningún movimiento este día"
          description="No hay operaciones abiertas ni cerradas en esta fecha. Usa las flechas para moverte de día, o vuelve al calendario."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              size="lg"
              label="P&L neto del día"
              value={formatSignedMoney(netPnl, { currency })}
              tone={pnlTone(netPnl)}
              description="Suma del P&L neto de las operaciones cerradas este día, después de comisiones. Es exactamente la cifra que enseña la celda del calendario: una operación cuenta el día que se cierra, no el día que se abre."
            />
            <StatTile
              size="lg"
              label="Cerradas"
              value={closed.length}
              sub={
                opened.length > 0
                  ? `${opened.length} abierta(s) que no cerraron hoy`
                  : undefined
              }
              description="Operaciones que terminaron este día. Son las que dejan el resultado del día."
            />
            <StatTile
              size="lg"
              label="Ganadas / perdidas"
              value={`${outcomes.wins} / ${outcomes.losses}`}
              tone={
                outcomes.wins > outcomes.losses
                  ? "positive"
                  : outcomes.losses > outcomes.wins
                    ? "negative"
                    : "neutral"
              }
              sub={outcomes.breakeven > 0 ? `${outcomes.breakeven} en tablas` : undefined}
              description="Reparto de las operaciones cerradas este día. Las de punto de equilibrio no cuentan como ganadas."
            />
            <StatTile
              size="lg"
              label="Comisiones"
              value={formatMoney(commissions, { currency })}
              description="Comisiones de todas las operaciones que tocaron este día, abiertas y cerradas."
            />
          </div>

          {closed.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Cerradas este día</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {closed.map((trade) => (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    timezone={timezone}
                    currency={currency}
                    fecha={fecha}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}

          {opened.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Abiertas este día</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {/* Dicho antes de la lista y no después: si no, el primer
                    impulso es sumar estas cifras al total de arriba y ver que
                    no cuadra. */}
                <p className="text-sm text-muted-foreground">
                  Se abrieron hoy pero cerraron más tarde, o siguen abiertas. No cuentan en el
                  resultado del día: su P&L pertenece al día en que se cierran.
                </p>
                {opened.map((trade) => (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    timezone={timezone}
                    currency={currency}
                    fecha={fecha}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Link
        href={`/dia/${fecha}` as Route}
        className="text-sm text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
      >
        Ver todo lo que hiciste este día, no sólo el trading
      </Link>
    </>
  );
}

/**
 * Una operación de la lista.
 *
 * Toda la fila es el enlace a su ficha: es lo que faltaba para poder «entrar a
 * cada operación» desde el día, que es a lo que se venía.
 */
function TradeRow({
  trade,
  timezone,
  currency,
  fecha,
}: {
  trade: TradeTableRow;
  timezone: string;
  currency: string;
  /** El día de la página: lo que decide qué horas necesitan fecha. */
  fecha: string;
}) {
  const abierta = trade.status === "OPEN";

  return (
    <Link
      href={`/trades/${trade.id}` as Route}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
    >
      <Badge variant="outline">{trade.direction === "LONG" ? "Larga" : "Corta"}</Badge>
      <span className="text-sm font-medium">{trade.product_id}</span>

      <span className="text-xs text-muted-foreground tabular-nums">
        {momento(trade.opened_at, timezone, fecha)}
        {abierta ? " · abierta" : ` → ${momento(trade.closed_at, timezone, fecha)}`}
      </span>

      {trade.duration_seconds !== null && !abierta ? (
        <span className="text-xs text-muted-foreground">{formatDuration(trade.duration_seconds)}</span>
      ) : null}

      {trade.session_effective ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {formatSessionLabel(trade.session_effective)}
        </span>
      ) : null}

      <span className="text-xs text-muted-foreground tabular-nums">
        {formatNumber(trade.max_size)} contrato(s)
      </span>

      <span className="ml-auto flex items-baseline gap-2">
        {trade.return_pct !== null ? (
          <span className={cn("text-xs tabular-nums", pnlColorClass(trade.return_pct))}>
            {formatPercent(trade.return_pct)}
          </span>
        ) : null}
        <span className={cn("text-sm font-medium tabular-nums", pnlColorClass(trade.net_pnl))}>
          {trade.net_pnl === null ? "--" : formatSignedMoney(trade.net_pnl, { currency })}
        </span>
      </span>
    </Link>
  );
}

/**
 * La hora, con su fecha si no es la de esta página.
 *
 * «15:00 → 09:00» en una operación que abrió ayer se lee al revés, como si
 * hubiera cerrado antes de abrirse. Que la hora de otro día venga con su fecha
 * es lo que deshace ese nudo, y sólo aparece cuando hace falta -- ponerla en
 * las tres de cada cuatro que sí son de hoy es ruido.
 */
function momento(iso: string | null, timezone: string, fecha: string): string {
  if (!iso) return "--";

  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone);
  if (!dt.isValid) return "--";

  const hora = dt.toFormat("HH:mm");
  return dt.toISODate() === fecha ? hora : `${dt.setLocale("es").toFormat("d LLL")} ${hora}`;
}
