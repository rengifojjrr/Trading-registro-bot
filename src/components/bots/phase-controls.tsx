"use client";

import { ArrowDown, ArrowUp, RotateCcw, Skull, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { changeBotPhase, deleteBot, reinstateBot, retireBot } from "@/app/(dashboard)/bots/actions";
import { NativeSelect } from "@/components/bots/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GateVerdict } from "@/lib/bots/gates";
import type { BotRecord } from "@/lib/bots/records";
import {
  PHASE_HINTS,
  PHASE_LABELS,
  PIPELINE_PHASES,
  REENTRY_PHASE,
  RETIREMENT_HINTS,
  RETIREMENT_LABELS,
  RETIREMENT_REASONS,
  nextPhase,
  previousPhase,
  type BotPhase,
  type RetirementReason,
} from "@/lib/bots/types";
import { formatDate } from "@/lib/format";

type Panel = "FASE" | "RETIRO" | null;

/**
 * Subir, bajar, retirar o devolver a la cantera.
 *
 * Subir desde F4 lo decide la puerta; si está cerrada, el servidor pide un
 * motivo y lo apunta como forzado. Aquí no se esconde el botón: la regla es
 * que la decisión se pueda revisar después, no que sea imposible tomarla.
 */
export function PhaseControls({
  bot,
  gateVerdict,
  gateSummary,
  tradeCount,
  timezone,
}: {
  bot: BotRecord;
  gateVerdict: GateVerdict;
  gateSummary: string;
  tradeCount: number;
  timezone: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [target, setTarget] = useState<BotPhase>(nextPhase(bot.phase) ?? bot.phase);
  const [reason, setReason] = useState("");
  const [retireReason, setRetireReason] = useState<RetirementReason>("ALPHA_DECAY");
  const [isPending, startTransition] = useTransition();

  function abrir(fase: BotPhase) {
    setTarget(fase);
    setReason("");
    setPanel("FASE");
  }

  function confirmarFase() {
    startTransition(async () => {
      const r = await changeBotPhase({ botId: bot.id, toPhase: target, reason });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`Ahora en ${target} · ${PHASE_LABELS[target]}.`);
      setPanel(null);
      router.refresh();
    });
  }

  function confirmarRetiro() {
    startTransition(async () => {
      const r = await retireBot({ botId: bot.id, reason: retireReason, note: reason });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Retirado. La lápida queda escrita.");
      setPanel(null);
      router.refresh();
    });
  }

  function volver() {
    startTransition(async () => {
      const r = await reinstateBot(bot.id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`De vuelta en la cantera, por ${REENTRY_PHASE}.`);
      router.refresh();
    });
  }

  function borrar() {
    if (!window.confirm(`¿Borrar «${bot.name}»? No tiene operaciones, así que no queda nada que recuperar.`)) return;
    startTransition(async () => {
      const r = await deleteBot(bot.id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Bot borrado.");
      router.push("/bots");
    });
  }

  if (bot.phase === "RETIRADO") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">
          Retirado el {formatDate(bot.retiredAt, timezone)}
          {bot.retirementReason ? (
            <>
              {" "}
              por <span className="font-medium">{RETIREMENT_LABELS[bot.retirementReason].toLowerCase()}</span>
            </>
          ) : null}
          .
        </p>
        {bot.retirementNote ? <p className="text-sm text-muted-foreground">{bot.retirementNote}</p> : null}
        <p className="text-xs text-muted-foreground">{PHASE_HINTS.RETIRADO}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={volver} disabled={isPending}>
            <RotateCcw className="size-4" aria-hidden />
            Volver a la cantera ({REENTRY_PHASE})
          </Button>
          {tradeCount === 0 ? (
            <Button size="sm" variant="ghost" onClick={borrar} disabled={isPending}>
              <Trash2 className="size-4 text-negative" aria-hidden />
              Borrar
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const siguiente = nextPhase(bot.phase);
  const anterior = previousPhase(bot.phase);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{PHASE_HINTS[bot.phase]}</p>

      <div className="flex flex-wrap gap-2">
        {siguiente ? (
          <Button size="sm" onClick={() => abrir(siguiente)} disabled={isPending}>
            <ArrowUp className="size-4" aria-hidden />
            Subir a {siguiente}
          </Button>
        ) : null}
        {anterior ? (
          <Button size="sm" variant="outline" onClick={() => abrir(anterior)} disabled={isPending}>
            <ArrowDown className="size-4" aria-hidden />
            Bajar a {anterior}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => { setReason(""); setPanel("RETIRO"); }} disabled={isPending}>
          <Skull className="size-4" aria-hidden />
          Retirar
        </Button>
        {tradeCount === 0 ? (
          <Button size="sm" variant="ghost" onClick={borrar} disabled={isPending}>
            <Trash2 className="size-4 text-negative" aria-hidden />
            Borrar
          </Button>
        ) : null}
      </div>

      {panel === "FASE" ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-secondary/30 p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phase-target">A qué fase</Label>
            <NativeSelect id="phase-target" value={target} onChange={(e) => setTarget(e.target.value as BotPhase)}>
              {PIPELINE_PHASES.filter((p) => p !== bot.phase).map((p) => (
                <option key={p} value={p}>
                  {p} · {PHASE_LABELS[p]}
                </option>
              ))}
            </NativeSelect>
          </div>

          {siguiente && PIPELINE_PHASES.indexOf(target as never) > PIPELINE_PHASES.indexOf(bot.phase as never) ? (
            <p className="text-sm text-muted-foreground">
              {gateVerdict === "GO"
                ? `Puerta abierta: ${gateSummary}`
                : `${gateSummary} Si lo subes igual, queda apuntado como forzado y hace falta un motivo.`}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phase-reason">Motivo</Label>
            <Textarea
              id="phase-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Se guarda en el historial con las cifras de hoy."
            />
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={confirmarFase} disabled={isPending}>
              {isPending ? "Cambiando…" : `Pasar a ${target}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "RETIRO" ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-secondary/30 p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="retire-reason">Por qué se retira</Label>
            <NativeSelect id="retire-reason" value={retireReason} onChange={(e) => setRetireReason(e.target.value as RetirementReason)}>
              {RETIREMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {RETIREMENT_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
            {RETIREMENT_HINTS[retireReason] ? (
              <p className="text-xs text-muted-foreground">{RETIREMENT_HINTS[retireReason]}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="retire-note">La autopsia</Label>
            <Textarea
              id="retire-note"
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Qué pasó, qué se aprendió y qué no se repite. Cada lápida es una lección."
            />
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={confirmarRetiro} disabled={isPending}>
              {isPending ? "Retirando…" : "Retirar el bot"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
