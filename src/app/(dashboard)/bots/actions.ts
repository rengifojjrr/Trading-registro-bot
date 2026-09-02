"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { fetchBotDetail, snapshotForHistory } from "@/lib/bots/queries";
import {
  baselineFormSchema,
  botFormSchema,
  parseBaseline,
  portfolioSettingsSchema,
} from "@/lib/bots/records";
import {
  GATED_FROM,
  PHASE_LABELS,
  PIPELINE_PHASES,
  REENTRY_PHASE,
  isBotPhase,
  isImpulseAction,
  isRetirementReason,
  nextPhase,
  type BotPhase,
} from "@/lib/bots/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Lo que se puede hacer con un bot.
 *
 * Cada cambio deja rastro: en `bot_phase_history` los de fase, con las
 * cifras del momento, y en el registro de auditoría todos. Un bot que está
 * en F6 sin que se sepa cuándo llegó ni con qué números es una decisión que
 * no se puede revisar, y revisar las decisiones es la mitad del método.
 */

export interface BotFormState {
  error: string | null;
  savedId: string | null;
}

const MAX_TRADES_PER_ASSIGNMENT = 200;

function revalidarBots(botId?: string) {
  revalidatePath("/bots");
  revalidatePath("/bots/equipo");
  revalidatePath("/bots/cantera");
  revalidatePath("/bots/riesgo");
  revalidatePath("/bots/impulsos");
  revalidatePath("/");
  if (botId) revalidatePath(`/bots/${botId}`);
}

function leerBaseline(formData: FormData) {
  const claves = [
    "profitFactor",
    "expectancyR",
    "winRate",
    "sharpe",
    "maxDrawdownPct",
    "tradesPerMonth",
    "trades",
    "source",
    "note",
  ] as const;
  const crudo: Record<string, unknown> = {};
  for (const clave of claves) {
    const valor = formData.get(`baseline_${clave}`);
    if (valor !== null) crudo[clave] = String(valor);
  }
  if (crudo.source === undefined) crudo.source = "MANUAL";
  return baselineFormSchema.safeParse(crudo);
}

/** Alta o edición. Con `id` en el formulario es edición. */
export async function saveBot(_prev: BotFormState, formData: FormData): Promise<BotFormState> {
  const user = await requireUser();

  const parsed = botFormSchema.safeParse({
    name: formData.get("name"),
    market: formData.get("market"),
    timeframe: formData.get("timeframe"),
    style: formData.get("style"),
    block: formData.get("block"),
    phase: formData.get("phase") || undefined,
    sizingPct: formData.get("sizingPct") || 0,
    riskPerTradePct: formData.get("riskPerTradePct") || 0.5,
    magicNumber: formData.get("magicNumber") ?? undefined,
    hypothesis: formData.get("hypothesis") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    backtestStrategyId: formData.get("backtestStrategyId") ?? undefined,
    strategyId: formData.get("strategyId") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", savedId: null };
  }

  const baseline = leerBaseline(formData);
  if (!baseline.success) {
    return { error: baseline.error.issues[0]?.message ?? "La línea base tiene un dato mal.", savedId: null };
  }

  const id = String(formData.get("id") ?? "").trim();
  const supabase = await createClient();
  const v = parsed.data;

  const campos = {
    name: v.name,
    market: v.market,
    timeframe: v.timeframe,
    style: v.style,
    block: v.block,
    sizing_pct: v.sizingPct,
    risk_per_trade_pct: v.riskPerTradePct,
    magic_number: v.magicNumber,
    hypothesis: v.hypothesis,
    notes: v.notes,
    backtest_strategy_id: v.backtestStrategyId,
    strategy_id: v.strategyId,
    baseline: baseline.data as unknown as Json,
  };

  if (id) {
    if (!z.uuid().safeParse(id).success) return { error: "Bot inválido.", savedId: null };
    const { error } = await supabase
      .from("bots")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: mensaje(error.code, "No se pudo guardar el bot."), savedId: null };

    await recordAudit({ userId: user.id, action: "BOT_UPDATED", entityType: "bot", entityId: id, metadata: { name: v.name } });
    revalidarBots(id);
    revalidatePath("/trades");
    return { error: null, savedId: id };
  }

  const fase: BotPhase = v.phase ?? "F1";
  const { data, error } = await supabase
    .from("bots")
    .insert({ user_id: user.id, ...campos, phase: fase })
    .select("id")
    .single();
  if (error || !data) return { error: mensaje(error?.code, "No se pudo crear el bot."), savedId: null };

  // La primera entrada del historial: por dónde entró.
  await supabase.from("bot_phase_history").insert({
    user_id: user.id,
    bot_id: data.id,
    from_phase: null,
    to_phase: fase,
    reason: "Alta.",
  });

  await recordAudit({ userId: user.id, action: "BOT_CREATED", entityType: "bot", entityId: data.id, metadata: { name: v.name, phase: fase } });
  revalidarBots(data.id);
  revalidatePath("/trades");
  return { error: null, savedId: data.id };
}

function mensaje(code: string | undefined, porDefecto: string): string {
  if (code === "23505") return "Ya tienes un bot con ese nombre.";
  if (code === "23514") return "Algún valor se sale de su rango.";
  return porDefecto;
}

export interface ActionResult {
  error: string | null;
}

/**
 * Subir o bajar de fase.
 *
 * Desde F4 el ascenso lo decide la puerta. Si está cerrada se puede forzar,
 * pero hay que escribir por qué, y queda apuntado como forzado: la regla es
 * que la decisión se pueda revisar, no que sea imposible saltársela.
 */
export async function changeBotPhase(input: {
  botId: string;
  toPhase: string;
  reason?: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(input.botId).success) return { error: "Bot inválido." };
  if (!isBotPhase(input.toPhase) || input.toPhase === "RETIRADO") return { error: "Fase inválida." };

  const foto = await snapshotForHistory(input.botId);
  if (!foto) return { error: "Ese bot no existe." };
  if (foto.bot.phase === "RETIRADO") return { error: "Un bot retirado vuelve por la cantera, no de un salto." };
  if (foto.bot.phase === input.toPhase) return { error: `Ya está en ${PHASE_LABELS[input.toPhase]}.` };

  const razon = (input.reason ?? "").trim();
  const sube = PIPELINE_PHASES.indexOf(input.toPhase as never) > PIPELINE_PHASES.indexOf(foto.bot.phase as never);
  const conPuerta = PIPELINE_PHASES.indexOf(foto.bot.phase as never) >= PIPELINE_PHASES.indexOf(GATED_FROM as never);
  const forzado = sube && conPuerta && foto.gate.verdict !== "GO";

  if (forzado && razon.length < 5) {
    return {
      error: `La puerta no está abierta (${foto.gate.summary}). Para subirlo igual, escribe por qué.`,
    };
  }
  if (sube && nextPhase(foto.bot.phase) !== input.toPhase && razon.length < 5) {
    return { error: "Saltarse una fase se puede, pero hay que escribir por qué." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bots")
    .update({ phase: input.toPhase, updated_at: new Date().toISOString() })
    .eq("id", input.botId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo cambiar la fase." };

  await supabase.from("bot_phase_history").insert({
    user_id: user.id,
    bot_id: input.botId,
    from_phase: foto.bot.phase,
    to_phase: input.toPhase,
    reason: razon || (sube ? "Puerta superada." : "Descenso."),
    metrics: { ...foto.metrics, forzado } as unknown as Json,
  });

  await recordAudit({
    userId: user.id,
    action: "BOT_PHASE_CHANGED",
    entityType: "bot",
    entityId: input.botId,
    metadata: { from: foto.bot.phase, to: input.toPhase, forzado, gate: foto.gate.verdict },
  });

  revalidarBots(input.botId);
  return { error: null };
}

/** Al cementerio, con su autopsia. */
export async function retireBot(input: { botId: string; reason: string; note?: string }): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(input.botId).success) return { error: "Bot inválido." };
  if (!isRetirementReason(input.reason)) return { error: "Elige el motivo del retiro." };

  const nota = (input.note ?? "").trim().slice(0, 2000);
  if (input.reason === "OTRO" && nota.length < 5) return { error: "Si el motivo es otro, escribe cuál." };

  const foto = await snapshotForHistory(input.botId);
  if (!foto) return { error: "Ese bot no existe." };
  if (foto.bot.phase === "RETIRADO") return { error: "Ya está retirado." };

  const ahora = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("bots")
    .update({
      phase: "RETIRADO",
      retired_at: ahora,
      retirement_reason: input.reason,
      retirement_note: nota || null,
      sizing_pct: 0,
      updated_at: ahora,
    })
    .eq("id", input.botId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo retirar el bot." };

  await supabase.from("bot_phase_history").insert({
    user_id: user.id,
    bot_id: input.botId,
    from_phase: foto.bot.phase,
    to_phase: "RETIRADO",
    reason: nota || input.reason,
    metrics: foto.metrics as unknown as Json,
  });

  await recordAudit({
    userId: user.id,
    action: "BOT_RETIRED",
    entityType: "bot",
    entityId: input.botId,
    metadata: { from: foto.bot.phase, reason: input.reason },
  });

  revalidarBots(input.botId);
  return { error: null };
}

/** Del cementerio a la cantera: por F3 y nunca más arriba. */
export async function reinstateBot(botId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(botId).success) return { error: "Bot inválido." };

  const foto = await snapshotForHistory(botId);
  if (!foto) return { error: "Ese bot no existe." };
  if (foto.bot.phase !== "RETIRADO") return { error: "Ese bot no está retirado." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bots")
    .update({
      phase: REENTRY_PHASE,
      retired_at: null,
      retirement_reason: null,
      retirement_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", botId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo devolver el bot a la cantera." };

  await supabase.from("bot_phase_history").insert({
    user_id: user.id,
    bot_id: botId,
    from_phase: "RETIRADO",
    to_phase: REENTRY_PHASE,
    reason: `Vuelve a la cantera. Se retiró por: ${foto.bot.retirementReason ?? "?"}${foto.bot.retirementNote ? ` -- ${foto.bot.retirementNote}` : ""}`,
    metrics: foto.metrics as unknown as Json,
  });

  await recordAudit({ userId: user.id, action: "BOT_PHASE_CHANGED", entityType: "bot", entityId: botId, metadata: { from: "RETIRADO", to: REENTRY_PHASE } });
  revalidarBots(botId);
  return { error: null };
}

/**
 * Borrar de verdad. Sólo un bot sin operaciones: con operaciones, lo que se
 * hace es retirarlo, que es lo que deja la lección escrita.
 */
export async function deleteBot(botId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(botId).success) return { error: "Bot inválido." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("bot_id", botId);
  if (count && count > 0) {
    return { error: `Tiene ${count} operación(es) asignada(s). Retíralo en vez de borrarlo, o quítale las operaciones antes.` };
  }

  const { data: bot } = await supabase.from("bots").select("name").eq("id", botId).eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("bots").delete().eq("id", botId).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar el bot." };

  await recordAudit({ userId: user.id, action: "BOT_DELETED", entityType: "bot", entityId: botId, metadata: { name: bot?.name ?? null } });
  revalidarBots();
  return { error: null };
}

/**
 * Decir qué bot abrió estas operaciones. Con `botId` a `null`, quitárselo.
 *
 * La asignación vive en la propia fila de `trades` y sobrevive al recálculo.
 * Va por una función de la base y no por un `update` directo porque `trades`
 * no tiene política de UPDATE para el usuario, a propósito: la escribe el
 * motor de reconstrucción, y lo único que el usuario puede tocar es esta
 * columna.
 */
export async function assignTradesToBot(input: {
  tradeIds: string[];
  botId: string | null;
}): Promise<ActionResult & { assigned: number }> {
  const user = await requireUser();

  const ids = z.array(z.uuid()).min(1).max(MAX_TRADES_PER_ASSIGNMENT).safeParse(input.tradeIds);
  if (!ids.success) {
    return {
      error:
        input.tradeIds.length > MAX_TRADES_PER_ASSIGNMENT
          ? `Son demasiadas de una vez (${input.tradeIds.length}). El tope es ${MAX_TRADES_PER_ASSIGNMENT}.`
          : "Operaciones inválidas.",
      assigned: 0,
    };
  }
  if (input.botId !== null && !z.uuid().safeParse(input.botId).success) return { error: "Bot inválido.", assigned: 0 };

  const supabase = await createClient();

  let botName: string | null = null;
  if (input.botId) {
    const { data: bot } = await supabase
      .from("bots")
      .select("name, phase")
      .eq("id", input.botId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bot) return { error: "Ese bot no existe.", assigned: 0 };
    botName = bot.name;
  }

  const { data, error } = await supabase.rpc("assign_trades_to_bot", {
    p_trade_ids: ids.data,
    p_bot_id: input.botId,
  });
  if (error) return { error: "No se pudieron asignar las operaciones.", assigned: 0 };

  const asignadas = data ?? 0;
  if (asignadas === 0) return { error: "No se asignó ninguna: esas operaciones no son tuyas.", assigned: 0 };
  await recordAudit({
    userId: user.id,
    action: "BOT_TRADES_ASSIGNED",
    entityType: "bot",
    entityId: input.botId ?? undefined,
    metadata: { bot: botName, operaciones: asignadas, quitar: input.botId === null },
  });

  revalidarBots(input.botId ?? undefined);
  revalidatePath("/trades");
  for (const id of ids.data) revalidatePath(`/trades/${id}`);
  return { error: null, assigned: asignadas };
}

export interface ImpulseFormState {
  error: string | null;
  success: boolean;
}

/** Apuntar lo que te pide el cuerpo, antes de hacerlo. */
export async function logImpulse(_prev: ImpulseFormState, formData: FormData): Promise<ImpulseFormState> {
  const user = await requireUser();

  const action = String(formData.get("action") ?? "");
  if (!isImpulseAction(action)) return { error: "Di qué te apetecía hacer.", success: false };

  const botId = String(formData.get("botId") ?? "").trim() || null;
  if (botId && !z.uuid().safeParse(botId).success) return { error: "Bot inválido.", success: false };

  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const executed = formData.get("executed") === "on";

  const supabase = await createClient();

  if (botId) {
    const { data: bot } = await supabase.from("bots").select("id").eq("id", botId).eq("user_id", user.id).maybeSingle();
    if (!bot) return { error: "Ese bot no existe.", success: false };
  }

  const { error } = await supabase.from("bot_impulses").insert({
    user_id: user.id,
    bot_id: botId,
    action,
    note: note || null,
    executed,
  });
  if (error) return { error: "No se pudo apuntar el impulso.", success: false };

  await recordAudit({ userId: user.id, action: "BOT_IMPULSE_LOGGED", entityType: "bot", entityId: botId ?? undefined, metadata: { action, executed } });
  revalidarBots(botId ?? undefined);
  return { error: null, success: true };
}

export async function setImpulseExecuted(impulseId: string, executed: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(impulseId).success) return { error: "Impulso inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bot_impulses")
    .update({ executed })
    .eq("id", impulseId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar." };

  revalidarBots();
  return { error: null };
}

export async function deleteImpulse(impulseId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(impulseId).success) return { error: "Impulso inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("bot_impulses").delete().eq("id", impulseId).eq("user_id", user.id);
  if (error) return { error: "No se pudo borrar." };

  revalidarBots();
  return { error: null };
}

export interface SettingsFormState {
  error: string | null;
  success: boolean;
}

/** Los umbrales del portfolio. Se cambian en la revisión anual, no un martes. */
export async function savePortfolioSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();

  const parsed = portfolioSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("bot_portfolio_settings").upsert(
    {
      user_id: user.id,
      target_convexo: v.targetConvexo,
      target_concavo: v.targetConcavo,
      target_hibrido: v.targetHibrido,
      ks_alert_pct: v.ksAlert,
      ks_reduce_pct: v.ksReduce,
      ks_close_pct: v.ksClose,
      ks_off_pct: v.ksOff,
      gate_profit_factor: v.gateProfitFactor,
      gate_expectancy_r: v.gateExpectancyR,
      gate_sharpe: v.gateSharpe,
      gate_max_drawdown_pct: v.gateMaxDrawdownPct,
      gate_min_trades: v.gateMinTrades,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: mensaje(error.code, "No se pudieron guardar los umbrales."), success: false };

  await recordAudit({ userId: user.id, action: "BOT_PORTFOLIO_SETTINGS_UPDATED", metadata: v });
  revalidarBots();
  return { error: null, success: true };
}

/**
 * Firmar el contrato de drawdown.
 *
 * La cifra sale del Monte Carlo (el percentil 95) y se guarda con fecha: a
 * partir de ahí, superarla no es mala suerte.
 */
export async function signDrawdownContract(input: { botId: string; pct: number }): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(input.botId).success) return { error: "Bot inválido." };
  const pct = z.number().min(0.1).max(100).safeParse(input.pct);
  if (!pct.success) return { error: "El contrato va del 0,1% al 100%." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bots")
    .update({
      drawdown_contract_pct: pct.data,
      contract_signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.botId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo firmar el contrato." };

  await recordAudit({ userId: user.id, action: "BOT_CONTRACT_SIGNED", entityType: "bot", entityId: input.botId, metadata: { pct: pct.data } });
  revalidarBots(input.botId);
  return { error: null };
}

/**
 * Tomar el histórico actual como línea base.
 *
 * Para un bot que llegó sin backtest: lo que hizo hasta hoy pasa a ser lo
 * que promete, y desde mañana se le compara contra ello.
 */
export async function setBaselineFromHistory(botId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(botId).success) return { error: "Bot inválido." };

  const detail = await fetchBotDetail(botId);
  if (!detail) return { error: "Ese bot no existe." };
  const m = detail.view.metrics;
  if (m.trades < 10) return { error: `Con ${m.trades} operaciones no hay línea base que tomar; hacen falta 10.` };

  const baseline = {
    ...parseBaseline(detail.view.bot.baseline),
    profitFactor: m.profitFactor,
    expectancyR: m.expectancyR,
    winRate: m.winRate,
    sharpe: m.sharpe,
    maxDrawdownPct: m.maxDrawdownPct,
    tradesPerMonth: m.tradesPerMonth,
    trades: m.trades,
    source: "HISTORICO" as const,
    note: `Tomada del histórico el ${new Date().toISOString().slice(0, 10)}.`,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bots")
    .update({ baseline: baseline as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", botId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar la línea base." };

  await recordAudit({ userId: user.id, action: "BOT_UPDATED", entityType: "bot", entityId: botId, metadata: { baseline: "HISTORICO", trades: m.trades } });
  revalidarBots(botId);
  return { error: null };
}
