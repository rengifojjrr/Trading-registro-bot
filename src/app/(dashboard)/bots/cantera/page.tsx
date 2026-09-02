import { Plus, Sprout } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { BlockBadge, GateBadge, PhaseBadge } from "@/components/bots/badges";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPortfolio } from "@/lib/bots/queries";
import {
  PHASE_HINTS,
  PHASE_LABELS,
  PIPELINE_PHASES,
  RETIREMENT_LABELS,
  isProduction,
} from "@/lib/bots/types";
import { formatDate } from "@/lib/format";

/**
 * La cantera y el cementerio.
 *
 * Nadie debuta en el primer equipo por caerle bien al entrenador: se sube
 * categoría a categoría demostrando números. Las cinco fases de la cantera
 * van de izquierda a derecha, y desde F4 cada bot lleva su puerta. Abajo, el
 * cementerio: cada lápida es una lección que el portfolio no repite.
 */
export default async function PipelinePage() {
  const p = await buildPortfolio();
  const cantera = p.bots.filter((v) => !isProduction(v.bot.phase) && v.bot.phase !== "RETIRADO");
  const retirados = p.bots.filter((v) => v.bot.phase === "RETIRADO");
  const fases = PIPELINE_PHASES.filter((f) => !isProduction(f));

  return (
    <>
      <PageHeader
        title="Cantera"
        description="De la idea a producción, fase a fase. Desde F4 los ascensos los deciden las puertas."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/bots/nuevo">
              <Plus className="size-4" aria-hidden />
              Nuevo bot
            </Link>
          </Button>
        }
      />

      {cantera.length === 0 && retirados.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title="La cantera está vacía"
          description="Aquí viven los bots que todavía no operan con dinero: prototipos, backtests y forward tests. Cada uno entra con una hipótesis en una frase."
          action={
            <Button asChild size="sm">
              <Link href="/bots/nuevo">Dar de alta un bot</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {fases.map((fase) => {
            const enFase = cantera.filter((v) => v.bot.phase === fase);
            return (
              <Card key={fase} className="flex flex-col">
                <CardHeader>
                  <CardTitle>
                    {fase} · {PHASE_LABELS[fase]}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{PHASE_HINTS[fase]}</p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-2">
                  {enFase.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nadie en esta fase.</p>
                  ) : (
                    enFase.map((v) => (
                      <Link
                        key={v.bot.id}
                        href={`/bots/${v.bot.id}` as Route}
                        className="flex flex-col gap-1.5 rounded-md border border-border p-2.5 transition-colors hover:bg-secondary/40"
                      >
                        <span className="text-sm font-medium text-foreground">{v.bot.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {v.bot.market} · {v.bot.timeframe} · {v.metrics.trades} ops.
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          <BlockBadge block={v.bot.block} />
                          {/* Antes de F3 no hay números que mirar; la puerta empezaría a decir «sin datos» a todo. */}
                          {fase === "F3" || fase === "F4" || fase === "F5" ? <GateBadge verdict={v.gate.verdict} /> : null}
                        </div>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cementerio</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cada lápida es una lección. Un bot retirado vuelve por F3, nunca más arriba.
          </p>
        </CardHeader>
        <CardContent>
          {retirados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna lápida todavía.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {retirados.map((v) => (
                <li key={v.bot.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/bots/${v.bot.id}` as Route} className="text-sm font-medium text-foreground hover:underline">
                      {v.bot.name}
                    </Link>
                    <PhaseBadge phase="RETIRADO" />
                    {v.bot.retirementReason ? <span className="text-xs text-muted-foreground">{RETIREMENT_LABELS[v.bot.retirementReason]}</span> : null}
                    <span className="text-xs text-muted-foreground">· {formatDate(v.bot.retiredAt, p.context.timezone)}</span>
                  </div>
                  {v.bot.retirementNote ? <p className="text-sm text-muted-foreground">{v.bot.retirementNote}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
