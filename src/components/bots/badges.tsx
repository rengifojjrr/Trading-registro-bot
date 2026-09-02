import { Badge } from "@/components/ui/badge";
import type { GateVerdict } from "@/lib/bots/gates";
import {
  BLOCK_LABELS,
  SEMAFORO_LABELS,
  type BotBlock,
  type BotPhase,
  type Semaforo,
} from "@/lib/bots/types";

/**
 * Las chapas del módulo: fase, bloque, semáforo y puerta.
 *
 * Están juntas para que un bot se pinte igual en la lista, en su ficha y en
 * la portada. El color del semáforo es el del método -- verde, amarillo,
 * naranja -- y no se reinterpreta: un naranja es «a papel», y tiene que
 * leerse como una alarma en cualquier pantalla.
 */

/** La fase, en corto. La etiqueta larga es para la ficha. */
export const PHASE_SHORT: Record<BotPhase, string> = {
  F1: "Ideación",
  F2: "Robustez",
  F3: "Validación",
  F4: "Forward",
  F5: "Incubación",
  F6: "Staging",
  F7: "Producción",
  RETIRADO: "Retirado",
};

export function PhaseBadge({ phase }: { phase: BotPhase }) {
  if (phase === "RETIRADO") return <Badge variant="outline">Retirado</Badge>;
  return (
    <Badge variant={phase === "F7" ? "default" : "outline"}>
      <span className="font-semibold">{phase}</span>
      <span className="opacity-80">· {PHASE_SHORT[phase]}</span>
    </Badge>
  );
}

export function BlockBadge({ block }: { block: BotBlock }) {
  return <Badge variant="outline">{BLOCK_LABELS[block]}</Badge>;
}

export function SemaforoBadge({ state }: { state: Semaforo }) {
  const variant =
    state === "VERDE"
      ? "positive"
      : state === "AMARILLO"
        ? "warning"
        : state === "NARANJA"
          ? "negative"
          : "outline";

  return (
    <Badge variant={variant}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {SEMAFORO_LABELS[state]}
    </Badge>
  );
}

export function GateBadge({ verdict }: { verdict: GateVerdict }) {
  if (verdict === "GO") return <Badge variant="positive">Puerta abierta</Badge>;
  if (verdict === "RETENIDO") return <Badge variant="warning">Retenido</Badge>;
  return <Badge variant="outline">Sin datos</Badge>;
}
