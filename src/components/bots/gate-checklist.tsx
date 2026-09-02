import { CircleCheck, CircleHelp, CircleX } from "lucide-react";

import { GateBadge } from "@/components/bots/badges";
import type { GateResult } from "@/lib/bots/gates";

/**
 * La puerta de la cantera, criterio a criterio.
 *
 * Se enseña lo que se pide y lo que hay, uno al lado del otro, porque un
 * «retenido» sin la cifra que lo retiene no dice qué hay que mejorar. Y la
 * muestra va la primera: sin ella los demás no cuentan.
 */
export function GateChecklist({ gate }: { gate: GateResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <GateBadge verdict={gate.verdict} />
        <span className="text-sm text-muted-foreground">{gate.summary}</span>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {gate.criteria.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            {c.pass === true ? (
              <CircleCheck className="size-4 shrink-0 text-positive" aria-label="Cumple" />
            ) : c.pass === false ? (
              <CircleX className="size-4 shrink-0 text-negative" aria-label="No cumple" />
            ) : (
              <CircleHelp className="size-4 shrink-0 text-muted-foreground" aria-label="Sin medir" />
            )}
            <span className="flex-1 text-foreground">{c.label}</span>
            <span className="text-xs text-muted-foreground">{c.required}</span>
            <span className="min-w-24 text-right tabular-nums text-foreground">{c.observed}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
