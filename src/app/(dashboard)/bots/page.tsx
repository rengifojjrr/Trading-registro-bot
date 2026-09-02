import { Bot, Plus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { PhaseBadge, SemaforoBadge } from "@/components/bots/badges";
import { DecisionsList } from "@/components/bots/decisions-list";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { nextReview } from "@/lib/bots/calendar";
import { buildPortfolio } from "@/lib/bots/queries";
import { PHASE_LABELS, PIPELINE_PHASES, isProduction } from "@/lib/bots/types";
import { formatSignedMoney, pnlTone } from "@/lib/format";

/**
 * La portada de los bots: el equipo, la cantera y lo que hay que decidir.
 *
 * Es la pantalla del domingo. Lo primero que se lee es la lista de
 * decisiones, porque es lo único que pide hacer algo; el resto es contexto
 * para tomarlas.
 */
export default async function BotsPage() {
  const p = await buildPortfolio();
  const { context } = p;

  if (p.bots.length === 0) {
    return (
      <>
        <PageHeader title="Bots" description="Los sistemas que operan solos: el equipo, la cantera y lo que hay que decidir." />
        <EmptyState
          icon={Bot}
          title="Todavía no hay ningún bot"
          description="Cada bot entra por la cantera con una hipótesis en una frase, sube de fase demostrando números y, cuando opera con dinero, lo vigila un semáforo contra lo que prometió. Da de alta el primero: puede ser una estrategia que ya corres o un prototipo."
          action={
            <Button asChild size="sm">
              <Link href="/bots/nuevo">
                <Plus className="size-4" aria-hidden />
                Dar de alta un bot
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const produccion = p.bots.filter((v) => isProduction(v.bot.phase));
  const cantera = p.bots.filter((v) => !isProduction(v.bot.phase) && v.bot.phase !== "RETIRADO");
  const retirados = p.bots.filter((v) => v.bot.phase === "RETIRADO");
  const proxima = nextReview(new Date(), context.timezone);

  return (
    <>
      <PageHeader
        title="Bots"
        description="Los sistemas que operan solos: el equipo, la cantera y lo que hay que decidir."
        action={
          <Button asChild size="sm">
            <Link href="/bots/nuevo">
              <Plus className="size-4" aria-hidden />
              Nuevo bot
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          size="lg"
          label="Neto del equipo"
          value={formatSignedMoney(p.team.netPnl, { currency: context.currency })}
          tone={pnlTone(p.team.netPnl)}
          sub={`${p.team.trades} operaciones cerradas`}
          description="P&L neto de las operaciones asignadas a bots en staging o producción, calculado con el mismo motor que el resto de la plataforma."
          provenanceHref="/bots/equipo"
          provenanceLabel="Ver el equipo"
        />
        <StatTile
          size="lg"
          label="En producción"
          value={produccion.length}
          sub={`${cantera.length} en la cantera · ${retirados.length} retirado${retirados.length === 1 ? "" : "s"}`}
          description="Bots en F6 (staging) o F7 (producción): los que operan con dinero."
          provenanceHref="/bots/cantera"
          provenanceLabel="Ver la cantera"
        />
        <StatTile
          size="lg"
          label="Kill-switch"
          value={p.killSwitch.level === 0 ? "Sin activar" : `Nivel ${p.killSwitch.level}`}
          tone={p.killSwitch.level === 0 ? "neutral" : p.killSwitch.level === 1 ? "warning" : "negative"}
          sub={p.killSwitch.drawdownPct === null ? "Falta el tamaño de la cuenta" : `${p.killSwitch.drawdownPct.toFixed(1)}% de drawdown del equipo`}
          description="La escalera de emergencia del portfolio: alerta, reducir al 50%, cerrar posiciones y apagón, sobre el drawdown conjunto de los bots que operan."
          provenanceHref="/bots/riesgo"
          provenanceLabel="Ver la escalera"
        />
        <StatTile
          size="lg"
          label="Próxima revisión"
          value={proxima ? proxima.title : "--"}
          sub={proxima ? (proxima.isToday ? "Hoy" : proxima.daysUntil === 1 ? "Mañana" : `En ${proxima.daysUntil} días · ${proxima.minutes} min`) : undefined}
          description="Los cambios de portfolio tienen su día. Fuera de ese día no se hacen."
          provenanceHref="/bots/calendario"
          provenanceLabel="Ver el calendario"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qué hay que decidir</CardTitle>
        </CardHeader>
        <CardContent>
          <DecisionsList items={p.decisions} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Semáforos del equipo</CardTitle>
          </CardHeader>
          <CardContent>
            {produccion.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nadie opera con dinero todavía. El equipo se llena desde la cantera, subiendo de fase.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {produccion.map((v) => (
                  <li key={v.bot.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/bots/${v.bot.id}` as Route} className="text-sm font-medium text-foreground hover:underline">
                      {v.bot.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <PhaseBadge phase={v.bot.phase} />
                      <SemaforoBadge state={v.health.state} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>La cantera</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5">
              {PIPELINE_PHASES.filter((f) => !isProduction(f)).map((fase) => {
                const enFase = cantera.filter((v) => v.bot.phase === fase);
                return (
                  <li key={fase} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">{fase}</span> · {PHASE_LABELS[fase]}
                    </span>
                    <span className="tabular-nums text-foreground">{enFase.length}</span>
                  </li>
                );
              })}
            </ul>
            <Link href="/bots/cantera" className="mt-3 inline-block text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
              Ver la cantera y el cementerio
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
