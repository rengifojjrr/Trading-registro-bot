/**
 * Carga en la cantera el estudio de backtests de agosto de 2026: cinco
 * candidatas que sobrevivieron y siete que no, cada una con sus cifras reales
 * y su autopsia.
 *
 * Los datos viven en src/lib/bots/backtests-2026.ts y salen del Strategy
 * Tester de TradingView sobre COINBASE:BTCUSD y COINBASE:ETHUSD en diario.
 * Este script sólo los traduce a filas de `bots` y `bot_phase_history`.
 *
 * Tres decisiones que conviene entender antes de ejecutarlo:
 *
 *   * La línea base es la ventana de los últimos 4 años, no el histórico
 *     completo. Comparar un bot en vivo contra un histórico que incluye
 *     2015-2020 es compararlo contra un mercado que ya no existe.
 *
 *   * Ninguna entra por encima de F3, porque ninguna ha pasado Monte Carlo ni
 *     forward testing. Las puertas están para respetarlas.
 *
 *   * `drawdown_contract_pct` se deja vacío a propósito: el contrato es el
 *     percentil 95 del Monte Carlo y ese Monte Carlo no se ha corrido. Un
 *     contrato inventado es peor que ningún contrato.
 *
 * Es idempotente: se apoya en la restricción única (user_id, name), así que
 * ejecutarlo dos veces actualiza las filas en vez de duplicarlas. No toca
 * ninguna operación ni ningún bot que no haya creado él mismo.
 *
 * Uso: npm run seed:backtests -- <email-del-usuario>
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (ver
 * .env.example). Escribe filas reales con la clave de servicio.
 */

import { createClient } from "@supabase/supabase-js";

import { CANDIDATOS, DESCARTADOS, VENTANA_RECIENTE, baselineDe } from "../src/lib/bots/backtests-2026";
import type { Database, Json } from "../src/types/database";

/** Marca en las notas para reconocer lo que sembró este script. */
const MARCA = "[estudio-backtests-2026-08]";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: npm run seed:backtests -- <email-del-usuario>");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno. Copia .env.example a .env.local y complétalo.",
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findUserByEmail(supabase, email);
  if (!user) {
    console.error(`No se encontró ningún usuario con el correo "${email}". Créalo primero (ver README).`);
    process.exit(1);
  }

  console.log(`Cargando el estudio de backtests para ${email} (${user.id})…\n`);

  let creados = 0;
  let actualizados = 0;

  // --- Las que siguen vivas -------------------------------------------------
  for (const c of CANDIDATOS) {
    const notes = [
      MARCA,
      c.periodoPrevio ? `Periodo previo: ${c.periodoPrevio}` : null,
      c.sensibilidad ? `Sensibilidad: ${c.sensibilidad}` : null,
      `Media geométrica: ${c.mensualPct}%/mes (${c.anualPct}%/año) en los últimos 4 años.`,
      "Medido al contado. El coste de financiación del perpetuo NO está incluido.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const existente = await buscarBot(supabase, user.id, c.name);

    const fila = {
      user_id: user.id,
      name: c.name,
      market: c.market,
      timeframe: c.timeframe,
      style: c.style,
      block: c.block,
      phase: c.phase,
      // Sin capital asignado: eso lo decide quien opera, no un seed.
      sizing_pct: 0,
      risk_per_trade_pct: 0.5,
      hypothesis: c.hypothesis,
      baseline: baselineDe(c) as unknown as Json,
      // A propósito vacío: exige Monte Carlo, y no se ha corrido.
      drawdown_contract_pct: null,
      notes,
    };

    const { data, error } = await supabase
      .from("bots")
      .upsert(fila, { onConflict: "user_id,name" })
      .select("id")
      .single();

    if (error) throw new Error(`No se pudo guardar "${c.name}": ${error.message}`);

    if (existente) {
      actualizados += 1;
      console.log(`  ~ ${c.phase}  ${c.name}`);
    } else {
      creados += 1;
      console.log(`  + ${c.phase}  ${c.name}  (+${c.reciente.pnlPct}% · ${c.mensualPct}%/mes · DD ${c.reciente.maxDrawdownPct}%)`);
      await registrarFase(supabase, user.id, data.id, null, c.phase, c);
    }
  }

  // --- El cementerio --------------------------------------------------------
  for (const d of DESCARTADOS) {
    const existente = await buscarBot(supabase, user.id, d.name);

    const fila = {
      user_id: user.id,
      name: d.name,
      market: d.market,
      timeframe: "1D",
      style: d.style,
      block: d.block,
      phase: "RETIRADO",
      sizing_pct: 0,
      risk_per_trade_pct: 0,
      baseline: {
        profitFactor: d.btc?.profitFactor ?? null,
        expectancyR: null,
        winRate: d.btc?.winRatePct ?? null,
        sharpe: null,
        maxDrawdownPct: d.btc?.maxDrawdownPct ?? null,
        tradesPerMonth: null,
        trades: d.btc?.trades ?? null,
        source: "BACKTEST" as const,
        note: "Descartada en el estudio de agosto de 2026. Ver la autopsia.",
      } as unknown as Json,
      drawdown_contract_pct: null,
      retired_at: new Date(`${VENTANA_RECIENTE.hasta}T00:00:00Z`).toISOString(),
      retirement_reason: d.reason,
      retirement_note: d.autopsia,
      notes: `${MARCA} Descartada sin llegar a operar.`,
    };

    const { data, error } = await supabase
      .from("bots")
      .upsert(fila, { onConflict: "user_id,name" })
      .select("id")
      .single();

    if (error) throw new Error(`No se pudo guardar "${d.name}": ${error.message}`);

    if (existente) {
      actualizados += 1;
      console.log(`  ~ †  ${d.name}`);
    } else {
      creados += 1;
      console.log(`  + †  ${d.name}  (${d.reason})`);
      await registrarFase(supabase, user.id, data.id, "F1", "RETIRADO", null, d.autopsia);
    }
  }

  console.log(`\nListo: ${creados} creados, ${actualizados} actualizados.`);
  console.log(`${CANDIDATOS.length} en la cantera, ${DESCARTADOS.length} en el cementerio.`);
  console.log("\nNinguno tiene capital asignado ni contrato de drawdown firmado:");
  console.log("eso exige Monte Carlo y forward testing, que todavía no se han hecho.");
}

/** Deja constancia de por qué el bot está en la fase en la que está. */
async function registrarFase(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  botId: string,
  from: string | null,
  to: string,
  candidato: (typeof CANDIDATOS)[number] | null,
  razon?: string,
) {
  const metrics = candidato
    ? {
        ventana: `${VENTANA_RECIENTE.desde} → ${VENTANA_RECIENTE.hasta}`,
        pnlPct: candidato.reciente.pnlPct,
        maxDrawdownPct: candidato.reciente.maxDrawdownPct,
        trades: candidato.reciente.trades,
        profitFactor: candidato.reciente.profitFactor,
        mensualPct: candidato.mensualPct,
      }
    : {};

  const { error } = await supabase.from("bot_phase_history").insert({
    user_id: userId,
    bot_id: botId,
    from_phase: from,
    to_phase: to,
    reason:
      razon ??
      "Backtest en dos mercados (BTC y ETH) y ventana fuera de muestra de 4 años. Sin Monte Carlo ni forward testing todavía.",
    metrics,
  });

  if (error) throw new Error(`No se pudo registrar la fase de ${botId}: ${error.message}`);
}

async function buscarBot(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string,
  name: string,
) {
  const { data } = await supabase
    .from("bots")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  return data;
}

async function findUserByEmail(
  supabase: ReturnType<typeof createClient<Database>>,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
