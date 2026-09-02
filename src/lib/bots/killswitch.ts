import type { PortfolioSettings } from "./types";

/**
 * La escalera de emergencia del portfolio.
 *
 * Es el cuadro de diferenciales de la casa. Los semáforos vigilan bot a bot;
 * esto vigila que no se tuerza todo a la vez. Cuatro niveles sobre el
 * drawdown del portfolio: alerta, reducir a la mitad, cerrar posiciones y
 * apagón total. Existe para que el día que la estadística falle se sepa qué
 * hacer sin discutirlo -- se decide antes del viaje, no durante el accidente.
 *
 * Puro.
 */

export type KillSwitchLevel = 0 | 1 | 2 | 3 | 4;

export interface KillSwitchStep {
  level: Exclude<KillSwitchLevel, 0>;
  label: string;
  /** Umbral de drawdown, en porcentaje. */
  threshold: number;
  instruction: string;
}

export interface KillSwitchReading {
  level: KillSwitchLevel;
  label: string;
  instruction: string;
  /** El drawdown que se midió, en porcentaje. `null` si no se pudo medir. */
  drawdownPct: number | null;
  steps: KillSwitchStep[];
  /** El siguiente escalón, para saber cuánto margen queda. */
  next: KillSwitchStep | null;
}

export function ladder(settings: PortfolioSettings["killSwitch"]): KillSwitchStep[] {
  return [
    {
      level: 1,
      label: "Alerta",
      threshold: settings.alert,
      instruction: "Avisar. Vigilar sin intervenir.",
    },
    {
      level: 2,
      label: "Reducción",
      threshold: settings.reduce,
      instruction: "Reducir el tamaño de todos los bots al 50%.",
    },
    {
      level: 3,
      label: "Pausa",
      threshold: settings.close,
      instruction: "Cerrar todas las posiciones abiertas.",
    },
    {
      level: 4,
      label: "Emergencia",
      threshold: settings.off,
      instruction: "Cerrar posiciones y desactivar todos los bots. Apagón total.",
    },
  ];
}

export function evaluateKillSwitch(
  drawdownPct: number | null,
  settings: PortfolioSettings["killSwitch"],
): KillSwitchReading {
  const steps = ladder(settings);

  if (drawdownPct === null) {
    return {
      level: 0,
      label: "Sin medir",
      instruction: "Falta el tamaño de la cuenta para medir el drawdown en porcentaje.",
      drawdownPct: null,
      steps,
      next: steps[0],
    };
  }

  // El escalón más alto que se ha superado. `>` y no `>=`: el nivel se
  // activa al pasar el umbral, no al tocarlo.
  const superados = steps.filter((s) => drawdownPct > s.threshold);
  const actual = superados[superados.length - 1];

  if (!actual) {
    return {
      level: 0,
      label: "Sin activación",
      instruction: "Dentro del perfil. Nada que hacer.",
      drawdownPct,
      steps,
      next: steps[0],
    };
  }

  return {
    level: actual.level,
    label: actual.label,
    instruction: actual.instruction,
    drawdownPct,
    steps,
    next: steps.find((s) => s.level === actual.level + 1) ?? null,
  };
}

/**
 * El drawdown actual del portfolio, en porcentaje del capital.
 *
 * Se mide desde el máximo de la curva de capital, con el capital como base:
 * un drawdown de 800 sobre 10.000 es un 8%, y sobre 100.000 es ruido. Sin
 * capital no hay porcentaje.
 */
export function currentDrawdownPct(
  cumulativeNet: number[],
  accountSize: number | null,
): { drawdownPct: number | null; drawdownMoney: number; peak: number; durationTrades: number } {
  let peak = 0;
  let acumulado = 0;
  let desdeElPico = 0;

  for (const neto of cumulativeNet) {
    acumulado += neto;
    if (acumulado >= peak) {
      peak = acumulado;
      desdeElPico = 0;
    } else {
      desdeElPico += 1;
    }
  }

  const drawdownMoney = Math.max(0, peak - acumulado);
  const base = accountSize && accountSize > 0 ? accountSize + peak : null;

  return {
    drawdownPct: base ? (drawdownMoney / base) * 100 : null,
    drawdownMoney,
    peak,
    durationTrades: desdeElPico,
  };
}
