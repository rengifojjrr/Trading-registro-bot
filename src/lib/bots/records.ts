import { z } from "zod";

import type { Database } from "@/types/database";

import {
  BLOCKS,
  DEFAULT_PORTFOLIO_SETTINGS,
  EMPTY_BASELINE,
  PIPELINE_PHASES,
  STYLES,
  isBotBlock,
  isBotPhase,
  isBotStyle,
  isRetirementReason,
  type Baseline,
  type BotBlock,
  type BotPhase,
  type BotStyle,
  type PortfolioSettings,
  type RetirementReason,
} from "./types";

/**
 * Cómo se lee un bot de la base sin fiarse, y qué se le exige al guardarlo.
 *
 * Vive aparte de las consultas y de las acciones por el mismo motivo que
 * `lib/backtest/persistence.ts`: un archivo con `"use server"` sólo exporta
 * funciones asíncronas, y esto son esquemas y conversiones normales que el
 * formulario también necesita.
 *
 * Puro.
 */

type BotRow = Database["public"]["Tables"]["bots"]["Row"];
type SettingsRow = Database["public"]["Tables"]["bot_portfolio_settings"]["Row"];

export interface BotRecord {
  id: string;
  name: string;
  market: string;
  timeframe: string;
  style: BotStyle;
  block: BotBlock;
  phase: BotPhase;
  sizingPct: number;
  riskPerTradePct: number;
  magicNumber: string | null;
  hypothesis: string | null;
  baseline: Baseline;
  drawdownContractPct: number | null;
  contractSignedAt: string | null;
  backtestStrategyId: string | null;
  strategyId: string | null;
  notes: string | null;
  retiredAt: string | null;
  retirementReason: RetirementReason | null;
  retirementNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export const baselineSchema = z.object({
  profitFactor: z.number().finite().min(0).nullable(),
  expectancyR: z.number().finite().nullable(),
  winRate: z.number().min(0).max(100).nullable(),
  sharpe: z.number().finite().nullable(),
  maxDrawdownPct: z.number().min(0).max(100).nullable(),
  tradesPerMonth: z.number().finite().min(0).nullable(),
  trades: z.number().int().min(0).nullable(),
  source: z.enum(["BACKTEST", "HISTORICO", "MANUAL"]),
  note: z.string().max(500).nullable(),
});

/**
 * La línea base leída de la base, campo a campo.
 *
 * Al contrario que una estrategia de backtest, media línea base sí es media
 * línea base: un profit factor sin Sharpe sigue sirviendo para comparar el
 * profit factor. Lo que no pase la comprobación se queda a `null`, no tumba
 * el resto.
 */
export function parseBaseline(raw: unknown): Baseline {
  const out: Baseline = { ...EMPTY_BASELINE };
  if (typeof raw !== "object" || raw === null) return out;

  const registro = raw as Record<string, unknown>;
  const claves = Object.keys(baselineSchema.shape) as (keyof Baseline)[];
  for (const clave of claves) {
    const resultado = baselineSchema.shape[clave].safeParse(registro[clave]);
    if (resultado.success) (out as unknown as Record<string, unknown>)[clave] = resultado.data;
  }
  return out;
}

export function rowToBot(row: BotRow): BotRecord {
  return {
    id: row.id,
    name: row.name,
    market: row.market,
    timeframe: row.timeframe,
    style: isBotStyle(row.style) ? row.style : "TENDENCIA",
    block: isBotBlock(row.block) ? row.block : "HIBRIDO",
    phase: isBotPhase(row.phase) ? row.phase : "F1",
    sizingPct: Number(row.sizing_pct),
    riskPerTradePct: Number(row.risk_per_trade_pct),
    magicNumber: row.magic_number,
    hypothesis: row.hypothesis,
    baseline: parseBaseline(row.baseline),
    drawdownContractPct: row.drawdown_contract_pct === null ? null : Number(row.drawdown_contract_pct),
    contractSignedAt: row.contract_signed_at,
    backtestStrategyId: row.backtest_strategy_id,
    strategyId: row.strategy_id,
    notes: row.notes,
    retiredAt: row.retired_at,
    retirementReason: isRetirementReason(row.retirement_reason) ? row.retirement_reason : null,
    retirementNote: row.retirement_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Los umbrales del usuario, o los de fábrica si nunca los tocó. */
export function rowToSettings(row: SettingsRow | null): PortfolioSettings {
  if (!row) return DEFAULT_PORTFOLIO_SETTINGS;
  return {
    targets: {
      CONVEXO: Number(row.target_convexo),
      CONCAVO: Number(row.target_concavo),
      HIBRIDO: Number(row.target_hibrido),
    },
    killSwitch: {
      alert: Number(row.ks_alert_pct),
      reduce: Number(row.ks_reduce_pct),
      close: Number(row.ks_close_pct),
      off: Number(row.ks_off_pct),
    },
    gates: {
      profitFactor: Number(row.gate_profit_factor),
      expectancyR: Number(row.gate_expectancy_r),
      sharpe: Number(row.gate_sharpe),
      maxDrawdownPct: Number(row.gate_max_drawdown_pct),
      minTrades: Number(row.gate_min_trades),
    },
  };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Demasiado largo.")
    .optional()
    .transform((v) => (v ? v : null));

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

/** Lo que el formulario del bot tiene que traer. */
export const botFormSchema = z.object({
  name: z.string().trim().min(1, "Ponle nombre al bot.").max(80, "El nombre es demasiado largo."),
  market: z.string().trim().min(1, "Di qué mercado opera.").max(60, "Demasiado largo."),
  timeframe: z.string().trim().min(1, "Di en qué temporalidad opera.").max(30, "Demasiado largo."),
  style: z.enum(STYLES as [BotStyle, ...BotStyle[]], { message: "Elige una familia." }),
  block: z.enum(BLOCKS as [BotBlock, ...BotBlock[]], { message: "Elige un bloque." }),
  phase: z.enum(PIPELINE_PHASES as [BotPhase, ...BotPhase[]]).optional(),
  sizingPct: z.coerce.number().min(0, "El tamaño va de 0 a 100.").max(100, "El tamaño va de 0 a 100."),
  riskPerTradePct: z.coerce
    .number()
    .min(0, "El riesgo por operación va de 0 a 10.")
    .max(10, "El riesgo por operación va de 0 a 10."),
  magicNumber: optionalText(60),
  hypothesis: optionalText(1000),
  notes: optionalText(5000),
  backtestStrategyId: optionalUuid,
  strategyId: optionalUuid,
});

export type BotFormValues = z.infer<typeof botFormSchema>;

/** Un número del formulario, o nada. La cadena vacía es «no lo sé», no cero. */
export const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return null;
    const texto = String(v).trim().replace(",", ".");
    if (texto === "") return null;
    const n = Number(texto);
    return Number.isFinite(n) ? n : NaN;
  })
  .pipe(z.number({ message: "Tiene que ser un número." }).nullable());

export const baselineFormSchema = z.object({
  profitFactor: optionalNumber.pipe(z.number().min(0).nullable()),
  expectancyR: optionalNumber,
  winRate: optionalNumber.pipe(z.number().min(0).max(100, "El win rate va de 0 a 100.").nullable()),
  sharpe: optionalNumber,
  maxDrawdownPct: optionalNumber.pipe(z.number().min(0).max(100, "El drawdown va de 0 a 100.").nullable()),
  tradesPerMonth: optionalNumber.pipe(z.number().min(0).nullable()),
  trades: optionalNumber.pipe(z.number().int("Las operaciones son un entero.").min(0).nullable()),
  source: z.enum(["BACKTEST", "HISTORICO", "MANUAL"]),
  note: optionalText(500),
});

export const portfolioSettingsSchema = z
  .object({
    targetConvexo: z.coerce.number().min(0).max(100),
    targetConcavo: z.coerce.number().min(0).max(100),
    targetHibrido: z.coerce.number().min(0).max(100),
    ksAlert: z.coerce.number().positive().max(100),
    ksReduce: z.coerce.number().positive().max(100),
    ksClose: z.coerce.number().positive().max(100),
    ksOff: z.coerce.number().positive().max(100),
    gateProfitFactor: z.coerce.number().positive(),
    gateExpectancyR: z.coerce.number().min(0),
    gateSharpe: z.coerce.number().min(0),
    gateMaxDrawdownPct: z.coerce.number().positive().max(100),
    gateMinTrades: z.coerce.number().int().positive(),
  })
  .refine((v) => Math.abs(v.targetConvexo + v.targetConcavo + v.targetHibrido - 100) < 1e-9, {
    message: "Los tres bloques tienen que sumar 100.",
  })
  .refine((v) => v.ksAlert < v.ksReduce && v.ksReduce < v.ksClose && v.ksClose < v.ksOff, {
    message: "La escalera tiene que subir: alerta < reducción < pausa < apagón.",
  });

export type PortfolioSettingsValues = z.infer<typeof portfolioSettingsSchema>;
