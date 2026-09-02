"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteImpulse, setImpulseExecuted } from "@/app/(dashboard)/bots/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IMPULSE_STATUS_LABELS, type ImpulseEvaluation } from "@/lib/bots/impulses";
import { IMPULSE_LABELS } from "@/lib/bots/types";
import { formatDateTime, formatSignedMoney, pnlColorClass } from "@/lib/format";

/**
 * Los impulsos, con su veredicto.
 *
 * Cada línea dice qué querías hacer, qué hizo el bot esa semana y cuánto
 * habría costado hacerte caso. La cifra en verde es una multa que no
 * pagaste; en rojo, una vez que tenías razón. Las dos importan: el diario
 * existe para saber cuál de los dos eres más veces.
 */
export function ImpulseList({
  evaluations,
  currency,
  timezone,
}: {
  evaluations: ImpulseEvaluation[];
  currency: string;
  timezone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (evaluations.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Ningún impulso apuntado todavía. El primero suele llegar tras tres pérdidas seguidas.
      </p>
    );
  }

  function marcar(id: string, executed: boolean) {
    startTransition(async () => {
      const r = await setImpulseExecuted(id, executed);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  }

  function borrar(id: string) {
    if (!window.confirm("¿Borrar este impulso del diario?")) return;
    startTransition(async () => {
      const r = await deleteImpulse(id);
      if (r.error) toast.error(r.error);
      else toast.success("Impulso borrado.");
      router.refresh();
    });
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {evaluations.map((e) => (
        <li key={e.impulse.id} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  e.status === "EVALUADO"
                    ? e.cost !== null && Number(e.cost) > 0
                      ? "positive"
                      : e.cost !== null && Number(e.cost) < 0
                        ? "negative"
                        : "outline"
                    : e.status === "PENDIENTE"
                      ? "warning"
                      : "outline"
                }
              >
                {IMPULSE_STATUS_LABELS[e.status]}
              </Badge>
              <span className="text-sm font-medium text-foreground">{IMPULSE_LABELS[e.impulse.action]}</span>
              <span className="text-xs text-muted-foreground">
                {e.impulse.botName ?? "La cuenta entera"} · {formatDateTime(e.impulse.createdAt, timezone)}
              </span>
            </div>
            {e.cost !== null ? (
              <span className={`text-sm font-semibold tabular-nums ${pnlColorClass(e.cost)}`}>
                {formatSignedMoney(e.cost, { currency })}
              </span>
            ) : null}
          </div>

          {e.impulse.note ? <p className="text-sm text-muted-foreground">{e.impulse.note}</p> : null}
          <p className="text-sm text-foreground">{e.verdict}</p>
          {e.status !== "PENDIENTE" ? (
            <p className="text-xs text-muted-foreground">
              El bot cerró {e.tradesAfter} operaci{e.tradesAfter === 1 ? "ón" : "ones"} esa semana, con un neto de{" "}
              {formatSignedMoney(e.netAfter, { currency })}.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => marcar(e.impulse.id, !e.impulse.executed)} disabled={isPending}>
              {e.impulse.executed ? "No lo hice" : "Al final lo hice"}
            </Button>
            <Button size="sm" variant="ghost" aria-label="Borrar impulso" onClick={() => borrar(e.impulse.id)} disabled={isPending}>
              <Trash2 className="size-4 text-negative" aria-hidden />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
