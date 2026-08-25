"use client";

import { CheckCircle2, PencilLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BulkJournalDialog } from "@/components/trades/bulk-journal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { describeBurst } from "@/lib/journal/bursts";
import type { InboxGroup } from "@/lib/journal/inbox";
import { formatDate, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Lo que falta por apuntar, ya agrupado por episodios.
 *
 * Cada grupo tiene su propio botón: un episodio se despacha entero, que es la
 * forma en que de verdad se apunta. Ir operación por operación es exactamente
 * lo que hace que el diario se quede vacío.
 */
export function InboxList({
  groups,
  strategies,
  timezone,
}: {
  groups: InboxGroup[];
  strategies: { id: string; name: string }[];
  timezone: string;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Lo apuntado se quita de la lista al momento en vez de esperar a que el
  // servidor revalide: ver desaparecer lo que acabas de hacer es la mitad de
  // la razón por la que se sigue despachando la bandeja hasta el final.
  const [done, setDone] = useState<Set<string>>(new Set());

  const visibles = groups.filter((g) => !g.trades.every((t) => done.has(t.id)));

  if (visibles.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="size-6 text-positive" aria-hidden />
          <p className="font-medium">No queda nada por apuntar.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Todo lo que has cerrado estas dos semanas tiene algo escrito. Es lo que hace que
            Comportamiento pueda decirte qué error te cuesta más dinero.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visibles.map((group) => {
        const key = group.trades[0].id;
        const esRafaga = group.burst !== null;

        return (
          <Card key={key} className={esRafaga ? "border-warning/40" : undefined}>
            <CardContent className="flex flex-col gap-3 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium">
                    {esRafaga && group.burst
                      ? describeBurst(group.burst)
                      : "1 operación suelta"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(group.trades[0].openedAt, timezone)} · {group.trades[0].productId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("font-medium tabular-nums", pnlColorClass(group.netPnl))}>
                    {formatSignedMoney(group.netPnl)}
                  </span>
                  <Button size="sm" onClick={() => setOpenGroup(key)}>
                    <PencilLine className="size-4" aria-hidden />
                    Apuntar
                  </Button>
                </div>
              </div>

              <ul className="flex flex-wrap gap-1.5">
                {group.trades.map((trade) => (
                  <li key={trade.id}>
                    <Link
                      href={`/trades/${trade.id}`}
                      className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs transition-colors hover:border-foreground/30"
                    >
                      <Badge variant="outline" className="border-0 px-0 text-[10px]">
                        {trade.direction === "LONG" ? "L" : "S"}
                      </Badge>
                      <span className="tabular-nums">{trade.size}</span>
                      <span className={cn("tabular-nums", pnlColorClass(trade.netPnl))}>
                        {formatSignedMoney(trade.netPnl)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>

            {openGroup === key ? (
              <BulkJournalDialog
                tradeIds={group.trades.map((t) => t.id)}
                strategies={strategies}
                onClose={() => setOpenGroup(null)}
                onApplied={() => {
                  setOpenGroup(null);
                  setDone((current) => {
                    const next = new Set(current);
                    for (const t of group.trades) next.add(t.id);
                    return next;
                  });
                }}
              />
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
