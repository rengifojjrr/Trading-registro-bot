/**
 * Pone la biblioteca de estrategias a operar en papel.
 *
 * Por cada estrategia de `src/lib/paper/strategy-library.ts` crea tres cosas:
 *
 *   1. Una fila en `backtest_strategies` con las reglas ejecutables. Es el
 *      camino que el propio esquema dejó previsto: `bots.backtest_strategy_id`
 *      existe desde el principio para que un bot pueda decir de qué reglas
 *      nació.
 *   2. Una fila en `bots`, en la fase que le corresponda.
 *   3. Una cuenta en `paper_accounts` con capital repartido y APAGADA.
 *
 * Nacen apagadas a propósito. Crear la cuenta y ponerla a operar son dos
 * decisiones distintas, y la segunda es del usuario: un seed que enciende
 * dieciocho bots deja al usuario mirando un panel que ya está corriendo antes
 * de que le haya dado tiempo a leer qué hace cada uno.
 *
 * La fase la decide lo que se ha medido de verdad, no el entusiasmo:
 *
 *   * F3 -- tiene backtest en dos mercados, ventana fuera de muestra y prueba
 *     de sensibilidad. Sólo Tortugas S2 en ETH está aquí.
 *   * F2 -- tiene backtest medido pero le falta sensibilidad o Monte Carlo.
 *   * F1 -- no tiene backtest propio todavía. Es una hipótesis con reglas
 *     escritas, que es exactamente lo que dice la fase.
 *
 * Ninguna pasa de F3, porque ninguna ha corrido Monte Carlo ni forward
 * testing, y las puertas están para respetarlas.
 *
 * Es idempotente: se apoya en las restricciones únicas (user_id, name) de
 * `bots` y `backtest_strategies` y en `bot_id` único de `paper_accounts`.
 * Ejecutarlo dos veces actualiza en vez de duplicar, y NO toca el capital ni el
 * interruptor de una cuenta que ya existe -- si el usuario le puso 5.000 € a un
 * bot y lo encendió, un seed no es quién para deshacerlo.
 *
 * Uso: npm run seed:simulador -- <email> [capital-por-bot]
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

import { BIBLIOTECA, type EstrategiaDeLaBiblioteca } from "../src/lib/paper/strategy-library";
import type { Database, Json } from "../src/types/database";

/** Lo que se le asigna a cada bot si no se dice otra cosa. */
const CAPITAL_POR_DEFECTO = 10_000;

/** Marca para reconocer lo que sembró este script. */
const MARCA = "[biblioteca-simulador]";

type Cliente = ReturnType<typeof createClient<Database>>;

async function main() {
  const email = process.argv[2];
  const capital = Number(process.argv[3] ?? CAPITAL_POR_DEFECTO);

  if (!email) {
    console.error("Uso: npm run seed:simulador -- <email-del-usuario> [capital-por-bot]");
    process.exit(1);
  }
  if (!Number.isFinite(capital) || capital <= 0) {
    console.error(`Capital inválido: "${process.argv[3]}". Tiene que ser un número mayor que cero.`);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. Copia .env.example a .env.local y complétalo.",
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findUserByEmail(supabase, email);
  if (!user) {
    console.error(`No se encontró ningún usuario con el correo "${email}".`);
    process.exit(1);
  }

  console.log(`Sembrando ${BIBLIOTECA.length} estrategias para ${email}`);
  console.log(`Capital por bot: ${capital.toLocaleString("es-ES")} USD (ficticio)\n`);

  // Los ajustes del simulador, si aún no los tiene. El 0,20% por lado es el
  // coste con el que se midió todo el estudio: cambiarlo aquí sin volver a
  // medir haría que la simulación y el backtest dejaran de ser comparables.
  const { error: errAjustes } = await supabase
    .from("paper_settings")
    .upsert(
      { user_id: user.id, comision_pct: 0.2, deslizamiento_pct: 0.02, capital_por_defecto: capital },
      { onConflict: "user_id" },
    );
  if (errAjustes) throw new Error(`No se pudieron guardar los ajustes: ${errAjustes.message}`);

  let creados = 0;
  let actualizados = 0;
  let cuentasIntactas = 0;

  for (const e of BIBLIOTECA) {
    const reglasId = await guardarReglas(supabase, user.id, e);
    const { botId, existia } = await guardarBot(supabase, user.id, e, reglasId);
    const tocada = await guardarCuenta(supabase, user.id, botId, capital);

    if (existia) actualizados += 1;
    else creados += 1;
    if (!tocada) cuentasIntactas += 1;

    const cifras = e.medido
      ? `${e.medido.pnlPct > 0 ? "+" : ""}${e.medido.pnlPct}% · PF ${e.medido.profitFactor}`
      : "sin backtest propio";
    console.log(
      `  ${existia ? "~" : "+"} [${e.familia.padEnd(9)}] ${e.nombre.padEnd(42)} ${e.temporalidad.padStart(3)}  ${cifras}`,
    );
  }

  console.log(`\n${creados} bots creados, ${actualizados} actualizados.`);
  if (cuentasIntactas > 0) {
    console.log(`${cuentasIntactas} cuentas se dejaron como estaban (ya tenían capital o estaban encendidas).`);
  }
  console.log("\nTodas nacen APAGADAS. Enciéndelas desde /bots/simulador cuando");
  console.log("hayas leído qué hace cada una.");
}

/**
 * Las reglas ejecutables. Se guardan con los costes con los que se midieron
 * porque un resultado sin ellos no se puede interpretar: el mismo backtest con
 * comisión cero y con comisión real son dos cosas distintas.
 */
async function guardarReglas(
  supabase: Cliente,
  userId: string,
  e: EstrategiaDeLaBiblioteca,
): Promise<string> {
  const { data, error } = await supabase
    .from("backtest_strategies")
    .upsert(
      {
        user_id: userId,
        name: e.nombre,
        product_id: e.mercado,
        rules: e.reglas as unknown as Json,
        costs: { feePerContract: 0, slippageTicks: 0, tickSize: 0.01, comisionPct: 0.2 } as unknown as Json,
        is_active: true,
      },
      { onConflict: "user_id,name" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`Reglas de "${e.nombre}": ${error.message}`);
  return data.id;
}

async function guardarBot(
  supabase: Cliente,
  userId: string,
  e: EstrategiaDeLaBiblioteca,
  reglasId: string,
): Promise<{ botId: string; existia: boolean }> {
  const { data: previo } = await supabase
    .from("bots")
    .select("id")
    .eq("user_id", userId)
    .eq("name", e.nombre)
    .maybeSingle();

  const notas = [
    MARCA,
    `Procedencia: ${e.procedencia}`,
    e.medido
      ? `Medido en ${e.medido.ventana}: ${e.medido.pnlPct}% con caída máxima del ${e.medido.ddPct}%, ${e.medido.trades} operaciones, factor de ganancia ${e.medido.profitFactor}.`
      : "Sin backtest propio todavía: las reglas están escritas pero nadie las ha medido. Por eso entra en F1.",
  ].join("\n\n");

  const { data, error } = await supabase
    .from("bots")
    .upsert(
      {
        user_id: userId,
        name: e.nombre,
        market: e.mercado,
        timeframe: e.temporalidad,
        style: e.estilo,
        block: e.bloque,
        phase: faseDe(e),
        familia_operativa: e.familia,
        hypothesis: e.hipotesis,
        descripcion_larga: e.descripcion,
        baseline: baselineDe(e) as unknown as Json,
        backtest_strategy_id: reglasId,
        // Sin capital declarado y sin contrato firmado: lo primero lo decide
        // quien opera y lo segundo exige un Monte Carlo que no se ha corrido.
        sizing_pct: 0,
        risk_per_trade_pct: 0.5,
        drawdown_contract_pct: null,
        notes: notas,
      },
      { onConflict: "user_id,name" },
    )
    .select("id")
    .single();

  if (error) throw new Error(`Bot "${e.nombre}": ${error.message}`);
  return { botId: data.id, existia: previo !== null };
}

/**
 * La cuenta de papel. Devuelve `true` si la escribió y `false` si la respetó.
 *
 * No se pisa una cuenta que ya existe. El usuario puede haberle cambiado el
 * capital o haberla encendido, y las dos cosas son decisiones suyas que un
 * seed no debe deshacer por el hecho de volver a ejecutarse.
 */
async function guardarCuenta(
  supabase: Cliente,
  userId: string,
  botId: string,
  capital: number,
): Promise<boolean> {
  const { data: previa } = await supabase
    .from("paper_accounts")
    .select("id")
    .eq("bot_id", botId)
    .maybeSingle();

  if (previa) return false;

  const { error } = await supabase.from("paper_accounts").insert({
    user_id: userId,
    bot_id: botId,
    enabled: false,
    capital_asignado: capital,
    efectivo: capital,
    equity: capital,
  });

  if (error) throw new Error(`Cuenta del bot ${botId}: ${error.message}`);
  return true;
}

/**
 * Todos nacen en F1, tengan backtest o no.
 *
 * Es la misma regla que sigue la creación de una en una desde
 * `/bots/estrategias`, y dos comportamientos distintos para el mismo acto
 * serían un fallo esperando a que alguien se pregunte por qué el mismo bot
 * aparece en una fase u otra según por dónde lo creó.
 *
 * Y es la regla correcta: de la biblioteca al dinero se sube fase a fase. Un
 * bot que apareciera ya en F3 porque su hoja de cálculo era buena se saltaría
 * entera la parte del método que sirve para algo. La evidencia medida no se
 * pierde: viaja en la línea base y en las notas, así que el semáforo tiene
 * contra qué compararlo desde el primer día.
 */
function faseDe(_e: EstrategiaDeLaBiblioteca): string {
  return "F1";
}

function baselineDe(e: EstrategiaDeLaBiblioteca): Record<string, unknown> {
  if (!e.medido) {
    return {
      profitFactor: null,
      expectancyR: null,
      winRate: null,
      sharpe: null,
      maxDrawdownPct: null,
      tradesPerMonth: null,
      trades: null,
      source: "MANUAL",
      note: "Sin backtest propio. Las reglas están escritas; las cifras están por medir.",
    };
  }
  return {
    profitFactor: e.medido.profitFactor,
    expectancyR: null,
    winRate: null,
    sharpe: null,
    maxDrawdownPct: e.medido.ddPct,
    tradesPerMonth: null,
    trades: e.medido.trades,
    source: "BACKTEST",
    note: `${e.medido.ventana}: ${e.medido.pnlPct}% sobre ${e.mercado} ${e.temporalidad}, comisión 0,20%/lado, sin apalancamiento, al contado.`,
  };
}

async function findUserByEmail(supabase: Cliente, email: string) {
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
