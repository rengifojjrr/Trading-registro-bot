import type { PendingItem } from "@/lib/pending/types";

import type { BlockAllocation } from "./blocks";
import type { GateResult } from "./gates";
import type { KillSwitchReading } from "./killswitch";
import type { HealthReading } from "./semaforo";
import {
  BLOCK_LABELS,
  GATED_FROM,
  PHASE_LABELS,
  PIPELINE_PHASES,
  SEMAFORO_INSTRUCTIONS,
  isProduction,
  nextPhase,
  type BotBlock,
  type BotPhase,
} from "./types";

/**
 * Lo que el portfolio de bots está esperando que decidas.
 *
 * Todo lo que sale de aquí lo decide un umbral, no una sensación: un semáforo
 * que cambió de color, una puerta que se abrió, un escalón de la escalera, un
 * bloque que se desvió, dos bots que se parecen demasiado, un impulso que ya
 * se puede evaluar. Si no hay un botón que lo resuelva, no sale.
 *
 * Devuelve la misma forma que el resto de lo pendiente de la portada, para
 * que «qué me falta» siga teniendo una sola respuesta.
 *
 * Puro.
 */

export interface BotForDecisions {
  id: string;
  name: string;
  phase: BotPhase;
  block: BotBlock;
  health: Pick<HealthReading, "state" | "reasons">;
  gate: Pick<GateResult, "verdict" | "summary">;
  contractBreached: boolean;
  /** Operaciones abiertas o cerradas en los últimos 30 días. Para el watchdog. */
  tradesLast30Days: number;
  /** Cuántas al mes debería hacer, según su línea base o su histórico. */
  expectedTradesPerMonth: number | null;
}

export interface PortfolioForDecisions {
  bots: BotForDecisions[];
  killSwitch: Pick<KillSwitchReading, "level" | "label" | "instruction" | "drawdownPct">;
  allocation: Pick<BlockAllocation, "deviates" | "rows" | "basis">;
  /** Pares medio gemelos, ya con nombres. */
  redundantPairs: { a: string; b: string; rho: number }[];
  impulsesToEvaluate: number;
}

/** Con menos operaciones esperadas al mes, el watchdog no tiene ritmo que vigilar. */
export const WATCHDOG_MIN_EXPECTED = 2;
/** Por debajo de esta fracción de lo esperado, el bot no late. */
export const WATCHDOG_RATIO = 0.25;

export function pendingDecisions(p: PortfolioForDecisions): PendingItem[] {
  const items: PendingItem[] = [];

  // La escalera pesa más que cualquier bot: si el portfolio entero se está
  // cayendo, lo de cada bot es detalle.
  if (p.killSwitch.level >= 1) {
    items.push({
      id: "bots-killswitch",
      title: `Kill-switch en nivel ${p.killSwitch.level}: ${p.killSwitch.label.toLowerCase()}`,
      detail: `Drawdown del portfolio del ${p.killSwitch.drawdownPct?.toFixed(1) ?? "?"}%. ${p.killSwitch.instruction}`,
      href: "/bots/riesgo",
      actionLabel: "Ver la escalera",
      severity: p.killSwitch.level >= 2 ? "CRITICO" : "AVISO",
      weight: 100 + p.killSwitch.level,
    });
  }

  for (const bot of p.bots) {
    if (bot.phase === "RETIRADO") continue;

    if (bot.contractBreached && isProduction(bot.phase)) {
      items.push({
        id: `bot-${bot.id}-contract`,
        title: `${bot.name} incumple su contrato de drawdown`,
        detail: "Superó el percentil 95 que firmó. No es mala suerte: es el momento de pasarlo a papel.",
        href: `/bots/${bot.id}`,
        actionLabel: "Ver el bot",
        severity: "CRITICO",
        weight: 90,
      });
    }

    if (bot.health.state === "NARANJA" && isProduction(bot.phase)) {
      items.push({
        id: `bot-${bot.id}-naranja`,
        title: `${bot.name} en naranja`,
        detail: `${bot.health.reasons[0] ?? ""} ${SEMAFORO_INSTRUCTIONS.NARANJA}`.trim(),
        href: `/bots/${bot.id}`,
        actionLabel: "Pasar a papel",
        severity: "CRITICO",
        weight: 85,
      });
    } else if (bot.health.state === "AMARILLO" && isProduction(bot.phase)) {
      items.push({
        id: `bot-${bot.id}-amarillo`,
        title: `${bot.name} en amarillo`,
        detail: `${bot.health.reasons[0] ?? ""} ${SEMAFORO_INSTRUCTIONS.AMARILLO}`.trim(),
        href: `/bots/${bot.id}`,
        actionLabel: "Reducir al 50%",
        severity: "AVISO",
        weight: 70,
      });
    }

    // El watchdog: un pulsómetro. No dice si el bot va a ganar, dice si el
    // corazón late a su ritmo. Un bot en producción que espera ocho
    // operaciones al mes y lleva cero en treinta días no está perdiendo:
    // está apagado, desconectado o roto, y eso se mira antes que nada.
    const esperadas = bot.expectedTradesPerMonth;
    if (
      isProduction(bot.phase) &&
      esperadas !== null &&
      esperadas >= WATCHDOG_MIN_EXPECTED &&
      bot.tradesLast30Days < esperadas * WATCHDOG_RATIO
    ) {
      items.push({
        id: `bot-${bot.id}-watchdog`,
        title: `${bot.name} opera menos de lo que debería`,
        detail: `${bot.tradesLast30Days} operaci${bot.tradesLast30Days === 1 ? "ón" : "ones"} en treinta días cuando espera unas ${Math.round(esperadas)} al mes. Comprueba que corre, que está conectado y que sus operaciones están asignadas.`,
        href: `/bots/${bot.id}`,
        actionLabel: "Ver el bot",
        severity: "AVISO",
        weight: 60,
      });
    }

    // A partir de F4 los ascensos los deciden las puertas. Una abierta es
    // una decisión que sólo falta ejecutar.
    const siguiente = nextPhase(bot.phase);
    if (bot.gate.verdict === "GO" && siguiente && gated(bot.phase)) {
      items.push({
        id: `bot-${bot.id}-go`,
        title: `${bot.name} puede subir a ${PHASE_LABELS[siguiente]}`,
        detail: bot.gate.summary,
        href: `/bots/${bot.id}`,
        actionLabel: "Ascender",
        severity: "INFO",
        weight: 50,
      });
    }
  }

  if (p.allocation.deviates) {
    const fuera = p.allocation.rows.filter((r) => Math.abs(r.delta) > 10);
    items.push({
      id: "bots-bloques",
      title: "Los bloques se han desviado del 40/40/20",
      detail: fuera
        .map((r) => `${BLOCK_LABELS[r.block]} al ${r.actual.toFixed(0)}% (objetivo ${r.target}%)`)
        .join(", ")
        .concat(". Se rebalancea en la revisión mensual, no antes."),
      href: "/bots/riesgo",
      actionLabel: "Ver los bloques",
      severity: "AVISO",
      weight: 40,
    });
  }

  if (p.redundantPairs.length > 0) {
    const [primero] = p.redundantPairs;
    items.push({
      id: "bots-correlacion",
      title:
        p.redundantPairs.length === 1
          ? `${primero.a} y ${primero.b} son medio gemelos`
          : `${p.redundantPairs.length} pares de bots se parecen demasiado`,
      detail: `Correlación de ${primero.rho.toFixed(2)} entre ${primero.a} y ${primero.b}. Dos bots que ganan y pierden los mismos días son uno con el doble de tamaño.`,
      href: "/bots/riesgo",
      actionLabel: "Ver correlaciones",
      severity: "AVISO",
      weight: 35,
    });
  }

  if (p.impulsesToEvaluate > 0) {
    items.push({
      id: "bots-impulsos",
      title:
        p.impulsesToEvaluate === 1
          ? "Un impulso ya se puede evaluar"
          : `${p.impulsesToEvaluate} impulsos ya se pueden evaluar`,
      detail: "Han pasado los siete días. Mira qué hizo el bot mientras tanto y cuánto habría costado hacerte caso.",
      href: "/bots/impulsos",
      actionLabel: "Ver el diario",
      severity: "INFO",
      weight: 20,
    });
  }

  return items.sort((a, b) => b.weight - a.weight);
}

/** Si en esta fase el ascenso lo decide la puerta y no la persona. */
export function gated(phase: BotPhase): boolean {
  const i = PIPELINE_PHASES.indexOf(phase as Exclude<BotPhase, "RETIRADO">);
  const desde = PIPELINE_PHASES.indexOf(GATED_FROM as Exclude<BotPhase, "RETIRADO">);
  return i >= desde && i < PIPELINE_PHASES.length - 1;
}
