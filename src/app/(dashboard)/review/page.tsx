import { DateTime } from "luxon";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeCommissionDrag,
  computeMistakeCost,
  type MistakeCost,
} from "@/lib/analytics/behaviour";
import { fetchTradesWithBehaviour } from "@/lib/analytics/behaviour-queries";
import { computeStats } from "@/lib/analytics/stats";
import { requireUser } from "@/lib/auth/require-user";
import { formatDate, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { MISTAKE_META } from "@/lib/journal/mistakes";
import { createClient } from "@/lib/supabase/server";

/**
 * The weekly review, as a fixed sequence rather than a blank page.
 *
 * A journal only changes behaviour if it gets read back, and "review your
 * week" with no structure reliably becomes "skim the P&L and close the
 * tab". This walks the same four questions every week: what happened, which
 * three trades went best, which three went worst, and what mistake cost the
 * most.
 */
export default async function ReviewPage(props: PageProps<"/review">) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const timezone = settings?.timezone || "UTC";

  // Weeks are addressed by their Monday, so a link to "this week" keeps
  // meaning the same week after it ends.
  const weekParam = typeof searchParams.week === "string" ? searchParams.week : undefined;
  const anchor = weekParam
    ? DateTime.fromISO(weekParam, { zone: timezone })
    : DateTime.now().setZone(timezone);
  const weekStart = (anchor.isValid ? anchor : DateTime.now().setZone(timezone)).startOf("week");
  const weekEnd = weekStart.endOf("week");

  const trades = await fetchTradesWithBehaviour({
    dateFrom: weekStart.toUTC().toISO() ?? undefined,
    dateTo: weekEnd.toUTC().toISO() ?? undefined,
  });

  const stats = computeStats(trades);
  const mistakes = computeMistakeCost(trades);
  const drag = computeCommissionDrag(trades);

  const closed = trades
    .filter((t) => t.status === "CLOSED" && t.netPnl !== null)
    .sort((a, b) => Number(b.netPnl) - Number(a.netPnl));
  const best = closed.slice(0, 3);
  const worst = [...closed].reverse().slice(0, 3);

  const prevWeek = weekStart.minus({ weeks: 1 }).toISODate();
  const nextWeek = weekStart.plus({ weeks: 1 }).toISODate();
  const isCurrentWeek = weekStart.hasSame(DateTime.now().setZone(timezone), "week");

  return (
    <>
      <PageHeader
        title="Revisión semanal"
        description="Las mismas cuatro preguntas cada semana. Es lo que convierte el registro en un cambio de hábito."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-5">
          <div className="flex flex-col">
            <span className="font-medium">
              {formatDate(weekStart.toUTC().toISO(), timezone)} — {formatDate(weekEnd.toUTC().toISO(), timezone)}
            </span>
            <span className="text-xs text-muted-foreground">
              {stats.closedTradesCount} operación(es) cerradas
            </span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/review?week=${prevWeek}`}>Semana anterior</Link>
            </Button>
            {isCurrentWeek ? (
              <Button variant="outline" size="sm" disabled>
                Semana siguiente
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/review?week=${nextWeek}`}>Semana siguiente</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {stats.closedTradesCount === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No cerraste ninguna operación esta semana"
          description="Una semana sin operar también es un dato: si fue por disciplina, es una buena semana."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>1. ¿Qué pasó?</CardTitle>
              <CardDescription>El resultado de la semana, sin interpretación.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-6">
              <Figure label="P&L neto" value={formatSignedMoney(stats.netPnl)} tone={stats.netPnl} />
              <Figure label="Ganadas" value={`${stats.wins}/${stats.closedTradesCount}`} />
              <Figure label="Comisiones" value={formatSignedMoney(`-${drag.commissions}`)} />
              <Figure
                label="Racha actual"
                value={
                  stats.currentStreak.type === "NONE"
                    ? "--"
                    : `${stats.currentStreak.count} ${stats.currentStreak.type === "WIN" ? "ganadora(s)" : "perdedora(s)"}`
                }
              />
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <TradeListCard
              title="2. Tus tres mejores"
              description="¿Qué tenían en común? Eso es lo que hay que repetir."
              trades={best}
              timezone={timezone}
            />
            <TradeListCard
              title="3. Tus tres peores"
              description="¿Fue el mercado o fuiste tú? La respuesta honesta está en las etiquetas."
              trades={worst}
              timezone={timezone}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>4. ¿Qué te costó más?</CardTitle>
              <CardDescription>
                {mistakes.length === 0
                  ? "No etiquetaste ningún error esta semana. Si hubo alguno, etiquétalo en la operación: es lo único que permite contarlos."
                  : "El error más caro de la semana. Si repites uno solo de estos arreglos, que sea este."}
              </CardDescription>
            </CardHeader>
            {mistakes.length > 0 ? (
              <CardContent className="flex flex-col gap-2">
                {mistakes.slice(0, 3).map((m: MistakeCost) => (
                  <div key={m.code} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{MISTAKE_META[m.code].label}</span>
                      <span className="text-xs text-muted-foreground">
                        {MISTAKE_META[m.code].description}
                      </span>
                    </div>
                    <span className={`tabular-nums ${pnlColorClass(m.totalNetPnl)}`}>
                      {formatSignedMoney(m.totalNetPnl)} en {m.trades}
                    </span>
                  </div>
                ))}
              </CardContent>
            ) : null}
          </Card>
        </>
      )}
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ? pnlColorClass(tone) : ""}`}>
        {value}
      </span>
    </div>
  );
}

function TradeListCard({
  title,
  description,
  trades,
  timezone,
}: {
  title: string;
  description: string;
  trades: { id: string; productId: string; netPnl: string | null; closedAt: string | null }[];
  timezone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {trades.map((t) => (
          <Link
            key={t.id}
            href={`/trades/${t.id}`}
            className="flex items-center justify-between gap-2 py-2 text-sm transition-colors hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <Badge variant="outline">{t.productId}</Badge>
              <span className="text-xs text-muted-foreground">{formatDate(t.closedAt, timezone)}</span>
            </div>
            <span className={`tabular-nums ${pnlColorClass(t.netPnl)}`}>
              {formatSignedMoney(t.netPnl)}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
