import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseStoredStrategy } from "@/lib/backtest/persistence";
import { validateStrategy } from "@/lib/backtest/rules";
import type { Strategy } from "@/lib/backtest/types";
import type { Vela } from "@/lib/charts/indicators";
import {
  esGranularidadPublica,
  velasPublicas,
  type GranularidadPublica,
} from "@/lib/coinbase/public-candles";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import {
  barrasEnMercado,
  evaluarVela,
  resultadoDeOperacion,
  tamanoPorCapital,
  valorDeCierre,
  type AjustesPapel,
  type MotivoSalida,
  type PosicionAbierta,
} from "./engine";
import { velasPendientes } from "./recuperacion";

/**
 * El ciclo del simulador: leer la base, pedir precio, preguntarle al motor y
 * escribir lo que diga.
 *
 * Todo el trabajo sucio vive aquí para que `engine.ts` no tenga nada de esto.
 * La división no es estética: el motor se prueba entero con velas escritas a
 * mano y este archivo no se puede probar sin una base de datos, así que cuanto
 * menos criterio haya aquí, más criterio queda cubierto por los tests. Lo
 * único que decide este archivo es de dónde salen los datos y en qué orden se
 * escriben.
 *
 * **Cómo es idempotente por vela.** Un ciclo que se dispara dos veces sobre la
 * misma vela cerrada no puede abrir dos posiciones, y para eso hay tres cosas,
 * de la más barata a la más segura:
 *
 *   1. Antes de evaluar, se mira cuál es el punto de curva más reciente en
 *      `paper_equity_points`. Ese punto es a la vez la curva y la marca de
 *      «hasta aquí evalué», y de él sale la lista de velas pendientes: las
 *      cerradas posteriores a esa hora, en orden. Una vela que ya tiene punto
 *      no vuelve a entrar en la lista, así que dos ciclos sobre la misma vela
 *      no la evalúan dos veces.
 *
 *      Se recuperan todas las pendientes y no sólo la última. El ciclo corre
 *      cada cinco minutos y las velas no le esperan: mirar sólo la última deja
 *      a un bot de un minuto viendo una de cada cinco, y hace que un stop que
 *      saltó dentro de una vela que nadie miró se compruebe tarde, contra un
 *      precio que ya no es el suyo. El tope de `VELAS_DE_RECUPERACION` corta
 *      la otra punta: tras un parón largo no se le inventa al bot un
 *      histórico de operaciones que no ocurrieron.
 *
 *   2. Ese punto se escribe con `on conflict do nothing` contra el índice
 *      único `(bot_id, ts)`. Dos ciclos simultáneos no pueden dejar dos
 *      puntos, ni fallar por intentarlo.
 *
 *   3. Y si aun así dos ciclos llegaran a la vez a la escritura, la base
 *      corta: el índice único parcial `paper_positions_una_abierta_por_bot`
 *      rechaza la segunda apertura, y el cierre se hace con un
 *      `update ... where status = 'ABIERTA'` que sólo puede tocar una fila --
 *      quien no toque ninguna no escribe la operación.
 *
 * No se usa `last_tick_at` como llave de idempotencia, aunque parezca la
 * natural. Esa columna significa «cuándo miré esta cuenta por última vez», y
 * es lo que distingue un bot sin señal de un bot que no se está ejecutando;
 * si además guardara la hora de la vela, un bot diario aparecería como parado
 * durante veintitrés horas al día de funcionamiento perfecto.
 */

/**
 * El cliente con el que escribe el ciclo.
 *
 * De servicio y no de sesión porque el ciclo lo dispara un cron, y un cron no
 * tiene sesión de nadie. Cada consulta filtra por `user_id` explícitamente
 * -- ver `escribirApertura` y compañía -- para que saltarse la RLS no
 * signifique escribirle a otro en su cuenta.
 */
type ClienteSimulador = SupabaseClient<Database>;

function clienteDelSimulador(): ClienteSimulador {
  return createAdminClient();
}

// ---------------------------------------------------------------------------
// Los ajustes de fábrica, iguales a los `default` de la migración.
//
// `paper_settings` no crea una fila al registrarse, así que no tener fila es
// lo normal y no un error: significa «todavía no los ha tocado».
// ---------------------------------------------------------------------------

export const AJUSTES_DE_FABRICA: AjustesPapel = { comisionPct: 0.2, deslizamientoPct: 0.02 };

/** Cuántas velas se le piden al mercado. Es el máximo del endpoint público. */
const VELAS_POR_CICLO = 300;

/** Por qué una cuenta encendida no llegó a evaluarse. */
export type MotivoOmision =
  | "SIN_ESTRATEGIA"
  | "ESTRATEGIA_INVALIDA"
  | "MERCADO_DESCONOCIDO"
  | "TEMPORALIDAD_NO_DISPONIBLE"
  | "SIN_VELAS"
  | "VELA_YA_EVALUADA"
  | "SIN_CAPITAL";

export interface DetalleCuenta {
  botId: string;
  nombre: string;
  accion: "ABIERTA" | "CERRADA" | "NADA" | "OMITIDA" | "ERROR";
  motivo?: MotivoOmision | MotivoSalida;
  error?: string;
  /** Cuántas velas atrasadas se recuperaron en esta pasada. */
  velasEvaluadas?: number;
}

export interface ResumenCiclo {
  /** Cuentas encendidas que se miraron. */
  cuentas: number;
  abiertas: number;
  cerradas: number;
  omitidas: number;
  errores: number;
  detalle: DetalleCuenta[];
}

/**
 * Un ciclo completo: una vela de cada bot encendido.
 *
 * Nunca lanza por culpa de un bot. Un mercado que no responde, una estrategia
 * mal guardada o una escritura rechazada se anotan en el detalle y el ciclo
 * sigue con el siguiente. La alternativa -- que el primer fallo tumbe el ciclo
 * entero -- convierte un bot roto en todos los bots parados, y eso se
 * descubre días después mirando por qué nadie ha operado.
 */
export async function correrCicloDePapel(
  opciones: { userId?: string } = {},
): Promise<ResumenCiclo> {
  const supabase = clienteDelSimulador();

  let consulta = supabase
    .from("paper_accounts")
    .select("id, user_id, bot_id, capital_asignado, efectivo, equity")
    .eq("enabled", true);
  if (opciones.userId) consulta = consulta.eq("user_id", opciones.userId);

  const { data: cuentas, error: errorCuentas } = await consulta;
  if (errorCuentas) throw new Error(`No se pudieron leer las cuentas: ${errorCuentas.message}`);
  if (!cuentas || cuentas.length === 0) {
    return { cuentas: 0, abiertas: 0, cerradas: 0, omitidas: 0, errores: 0, detalle: [] };
  }

  const bots = await leerBots(
    supabase,
    cuentas.map((c) => c.bot_id),
  );
  const estrategias = await leerEstrategias(
    supabase,
    [...bots.values()].map((b) => b.backtest_strategy_id),
  );
  const ajustes = await leerAjustes(
    supabase,
    cuentas.map((c) => c.user_id),
  );

  // Las velas se piden una vez por mercado y temporalidad, no una por bot.
  // Diez bots sobre BTC en diario son una sola llamada a Coinbase; sin esto
  // serían diez idénticas, y la API pública tiene límite de peticiones.
  const cacheVelas = new Map<string, Vela[]>();

  const detalle: DetalleCuenta[] = [];

  for (const cuenta of cuentas) {
    const bot = bots.get(cuenta.bot_id);
    const nombre = bot?.name ?? cuenta.bot_id;

    try {
      detalle.push(
        await procesarCuenta({
          supabase,
          cuenta,
          bot,
          estrategias,
          ajustes: ajustes.get(cuenta.user_id) ?? AJUSTES_DE_FABRICA,
          cacheVelas,
        }),
      );
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "Error desconocido";
      console.error("[paper/runner]", nombre, mensaje);
      detalle.push({ botId: cuenta.bot_id, nombre, accion: "ERROR", error: mensaje });
    }
  }

  return {
    cuentas: cuentas.length,
    abiertas: detalle.filter((d) => d.accion === "ABIERTA").length,
    cerradas: detalle.filter((d) => d.accion === "CERRADA").length,
    omitidas: detalle.filter((d) => d.accion === "OMITIDA").length,
    errores: detalle.filter((d) => d.accion === "ERROR").length,
    detalle,
  };
}

type FilaCuenta = {
  id: string;
  user_id: string;
  bot_id: string;
  capital_asignado: string;
  efectivo: string;
  equity: string;
};

type FilaBot = {
  id: string;
  name: string;
  market: string;
  timeframe: string;
  backtest_strategy_id: string | null;
};

/** Una cuenta, de principio a fin. */
async function procesarCuenta(entrada: {
  supabase: ClienteSimulador;
  cuenta: FilaCuenta;
  bot: FilaBot | undefined;
  estrategias: Map<string, Strategy>;
  ajustes: AjustesPapel;
  cacheVelas: Map<string, Vela[]>;
}): Promise<DetalleCuenta> {
  const { supabase, cuenta, bot, estrategias, ajustes, cacheVelas } = entrada;
  const nombre = bot?.name ?? cuenta.bot_id;
  const omitir = (motivo: MotivoOmision): DetalleCuenta => ({
    botId: cuenta.bot_id,
    nombre,
    accion: "OMITIDA",
    motivo,
  });

  if (!bot?.backtest_strategy_id) return omitir("SIN_ESTRATEGIA");

  const estrategia = estrategias.get(bot.backtest_strategy_id);
  // `parseStoredStrategy` devuelve una estrategia vacía cuando lo guardado no
  // se puede leer, y una vacía no entra nunca. Aquí se distingue de una que sí
  // se puede correr para que la pantalla pueda decir «esta está mal escrita»
  // en vez de «lleva un mes sin señales».
  if (!estrategia || validateStrategy(estrategia).length > 0) return omitir("ESTRATEGIA_INVALIDA");

  const producto = productoDeMercado(bot.market);
  if (!producto) return omitir("MERCADO_DESCONOCIDO");

  const granularidad = granularidadDeTemporalidad(bot.timeframe);
  if (!granularidad) return omitir("TEMPORALIDAD_NO_DISPONIBLE");

  const clave = `${producto}|${granularidad}`;
  let velas = cacheVelas.get(clave);
  if (!velas) {
    velas = normalizarVelas(await velasPublicas(producto, granularidad, VELAS_POR_CICLO));
    cacheVelas.set(clave, velas);
  }
  if (velas.length < 2) return omitir("SIN_VELAS");

  // Hasta dónde llegó la última vez. El punto de curva más reciente es a la
  // vez la curva y la marca de «hasta aquí evalué»; ver la cabecera.
  const { data: ultimoPunto } = await supabase
    .from("paper_equity_points")
    .select("ts")
    .eq("bot_id", cuenta.bot_id)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ultimaEvaluada = ultimoPunto
    ? Math.floor(new Date(ultimoPunto.ts).getTime() / 1000)
    : null;

  const pendientes = velasPendientes(velas, ultimaEvaluada);
  if (pendientes.length === 0) {
    await marcarVisita(supabase, cuenta);
    return omitir("VELA_YA_EVALUADA");
  }

  // Sólo se lee una vez: a partir de aquí la posición viva la llevan
  // `posicion` y `posicionId`, que sí cambian vela a vela.
  const posicionFila = await leerPosicionAbierta(supabase, cuenta);
  let posicion = posicionFila ? aPosicion(posicionFila) : null;
  let posicionId = posicionFila?.id ?? null;
  let efectivo = Number(cuenta.efectivo);
  let patrimonio = efectivo;
  let abiertas = 0;
  let cerradas = 0;
  let ultimoMotivo: MotivoSalida | undefined;

  // Una pasada por cada vela cerrada que quedó sin mirar, en orden.
  //
  // Antes se evaluaba sólo la última y se daban por perdidas las de en medio.
  // Con el ciclo cada cinco minutos, un bot de un minuto veía una vela de cada
  // cinco: se perdían señales, y un stop que saltó dentro de una vela que
  // nadie miró se comprobaba tres velas tarde contra un precio que ya no era
  // el suyo. Cada vuelta ve exactamente lo que habría visto en su momento --
  // `velas.slice(0, i + 1)` --, así que el resultado no depende de cuándo
  // llegó el ciclo.
  for (const i of pendientes) {
    const vela = velas[i];
    const hasta = velas.slice(0, i + 1);
    const horaVela = new Date(vela.time * 1000).toISOString();

    const accion = evaluarVela({
      velas: hasta,
      estrategia,
      posicion,
      ajustes,
      // El mismo corte de sesión que usa el motor de backtest
      // (`buildContext`): día natural UTC. Sólo afecta al VWAP, y con un
      // corte distinto el papel y el backtest dibujarían dos niveles
      // distintos del mismo indicador.
      sessionOf: (t) => String(Math.floor(t / 86400)),
    });

    if (accion.tipo === "ABRIR") {
      // El tamaño sale del dinero de la cuenta, que es el capital que el
      // usuario le asignó al bot más lo que haya ganado o perdido desde
      // entonces -- nunca de un número de contratos fijo. Con la posición
      // cerrada el efectivo ES la cuenta entera, así que esto es «orden al
      // 100% del capital», exactamente las condiciones con las que se
      // midieron las líneas base en `lib/bots/backtests-2026.ts`. Sin esa
      // igualdad, comparar el papel con el backtest no significa nada.
      const size = tamanoPorCapital(efectivo, accion.precio);
      if (size > 0) {
        const nueva: PosicionAbierta = {
          side: accion.side,
          size,
          precioEntrada: accion.precio,
          horaEntrada: vela.time,
          stop: accion.stop,
          objetivo: accion.objetivo,
          atrEntrada: accion.atr,
        };

        const id = await escribirApertura(supabase, cuenta, nueva, horaVela);
        if (id) {
          efectivo = redondearDinero(efectivo - size * accion.precio);
          posicion = nueva;
          posicionId = id;
          abiertas += 1;
        }
      }
    } else if (accion.tipo === "CERRAR" && posicion && posicionId) {
      const cerrada = await escribirCierre({
        supabase,
        cuenta,
        posicionId,
        posicion,
        precioSalida: accion.precio,
        motivo: accion.motivo,
        horaSalida: horaVela,
        barras: barrasEnMercado(hasta, posicion.horaEntrada),
        comisionPct: ajustes.comisionPct,
      });

      if (cerrada) {
        efectivo = redondearDinero(
          efectivo + valorDeCierre(posicion, accion.precio, ajustes.comisionPct),
        );
        posicion = null;
        posicionId = null;
        cerradas += 1;
        ultimoMotivo = accion.motivo;
      }
    }

    // El patrimonio es el efectivo más lo que devolvería cerrar ahora: la
    // misma fórmula que se usa al cerrar de verdad, para que la curva y el
    // histórico de operaciones no puedan contar dos historias distintas.
    //
    // Se acota a cero porque la base no admite un patrimonio negativo. Que
    // haga falta la cota significa que la cuenta se arruinó -- una cuenta
    // simulada puede perderlo todo, pero no puede deber dinero -- y es mejor
    // guardar el cero que dejar que la escritura falle y pare el ciclo.
    patrimonio = Math.max(
      0,
      redondearDinero(
        efectivo + (posicion ? valorDeCierre(posicion, vela.close, ajustes.comisionPct) : 0),
      ),
    );

    await supabase
      .from("paper_equity_points")
      .upsert(
        { user_id: cuenta.user_id, bot_id: cuenta.bot_id, ts: horaVela, equity: patrimonio },
        { onConflict: "bot_id,ts", ignoreDuplicates: true },
      );
  }

  // La cuenta se actualiza una vez al final y no en cada vuelta: lo que
  // importa es dónde quedó, y escribirla en cada vela sería pagar una
  // escritura por vela recuperada sin que nadie vea los estados intermedios.
  await supabase
    .from("paper_accounts")
    .update({
      efectivo: Math.max(0, efectivo),
      equity: patrimonio,
      last_tick_at: new Date().toISOString(),
    })
    .eq("id", cuenta.id)
    .eq("user_id", cuenta.user_id);

  return {
    botId: cuenta.bot_id,
    nombre,
    accion: cerradas > 0 ? "CERRADA" : abiertas > 0 ? "ABIERTA" : "NADA",
    motivo: ultimoMotivo,
    velasEvaluadas: pendientes.length,
  };
}


async function marcarVisita(supabase: ClienteSimulador, cuenta: FilaCuenta): Promise<void> {
  await supabase
    .from("paper_accounts")
    .update({ last_tick_at: new Date().toISOString() })
    .eq("id", cuenta.id)
    .eq("user_id", cuenta.user_id);
}

/**
 * Escribe la apertura. Devuelve `false` si otro ciclo se le adelantó.
 *
 * Un `23505` aquí es el índice único parcial de posiciones abiertas haciendo
 * su trabajo: no es un error del que haya que avisar, es la protección contra
 * la doble apertura funcionando. Cualquier otro error sí se propaga.
 */
async function escribirApertura(
  supabase: ClienteSimulador,
  cuenta: FilaCuenta,
  posicion: PosicionAbierta,
  horaVela: string,
): Promise<string | null> {
  const { data, error } = await supabase.from("paper_positions").insert({
    user_id: cuenta.user_id,
    bot_id: cuenta.bot_id,
    side: posicion.side,
    size: posicion.size,
    precio_entrada: posicion.precioEntrada,
    hora_entrada: horaVela,
    stop: posicion.stop,
    objetivo: posicion.objetivo,
    atr_entrada: posicion.atrEntrada,
    status: "ABIERTA",
  })
    // El identificador hace falta aquí mismo: en una pasada de recuperación
    // la misma posición puede abrirse y cerrarse en dos velas seguidas, y
    // volver a leerla de la base sería una consulta por vela.
    .select("id")
    .single();

  if (!error) return data?.id ?? null;
  // 23505: el índice único parcial rechazó una segunda posición abierta.
  if (error.code === "23505") return null;
  throw new Error(`No se pudo abrir la posición: ${error.message}`);
}

/**
 * Cierra la posición y escribe la operación. Devuelve `false` si ya estaba
 * cerrada.
 *
 * El orden importa: primero se marca la posición como cerrada **exigiendo que
 * estuviera abierta**, y sólo si esa actualización toca una fila se escribe la
 * operación. Al revés -- escribir la operación y después cerrar -- dos ciclos
 * simultáneos meterían dos operaciones idénticas en el histórico, que es
 * justo lo que hace que las cifras de la ficha dejen de cuadrar.
 */
async function escribirCierre(entrada: {
  supabase: ClienteSimulador;
  cuenta: FilaCuenta;
  posicionId: string;
  posicion: PosicionAbierta;
  precioSalida: number;
  motivo: MotivoSalida;
  horaSalida: string;
  barras: number;
  comisionPct: number;
}): Promise<boolean> {
  const { supabase, cuenta, posicionId, posicion } = entrada;

  const { data: tocadas, error: errorCierre } = await supabase
    .from("paper_positions")
    .update({ status: "CERRADA" })
    .eq("id", posicionId)
    .eq("user_id", cuenta.user_id)
    .eq("status", "ABIERTA")
    .select("id");

  if (errorCierre) throw new Error(`No se pudo cerrar la posición: ${errorCierre.message}`);
  if (!tocadas || tocadas.length === 0) return false;

  const resultado = resultadoDeOperacion({
    side: posicion.side,
    size: posicion.size,
    precioEntrada: posicion.precioEntrada,
    precioSalida: entrada.precioSalida,
    comisionPct: entrada.comisionPct,
  });

  const { error } = await supabase.from("paper_trades").insert({
    user_id: cuenta.user_id,
    bot_id: cuenta.bot_id,
    position_id: posicionId,
    side: posicion.side,
    size: posicion.size,
    precio_entrada: posicion.precioEntrada,
    hora_entrada: new Date(posicion.horaEntrada * 1000).toISOString(),
    precio_salida: entrada.precioSalida,
    hora_salida: entrada.horaSalida,
    pnl: resultado.pnl,
    pnl_pct: resultado.pnlPct,
    comision: resultado.comision,
    motivo_salida: entrada.motivo,
    barras_en_mercado: entrada.barras,
  });

  if (error) throw new Error(`No se pudo guardar la operación: ${error.message}`);
  return true;
}

// ---------------------------------------------------------------------------
// Lecturas auxiliares
// ---------------------------------------------------------------------------

async function leerBots(
  supabase: ClienteSimulador,
  botIds: string[],
): Promise<Map<string, FilaBot>> {
  const { data } = await supabase
    .from("bots")
    .select("id, name, market, timeframe, backtest_strategy_id")
    .in("id", botIds);

  return new Map((data ?? []).map((b) => [b.id, b]));
}

async function leerEstrategias(
  supabase: ClienteSimulador,
  ids: (string | null)[],
): Promise<Map<string, Strategy>> {
  const limpios = [...new Set(ids.filter((id): id is string => id !== null))];
  if (limpios.length === 0) return new Map();

  const { data } = await supabase.from("backtest_strategies").select("id, rules").in("id", limpios);

  return new Map((data ?? []).map((s) => [s.id, parseStoredStrategy(s.rules)]));
}

/** Los costes de cada usuario, o los de fábrica si nunca los tocó. */
async function leerAjustes(
  supabase: ClienteSimulador,
  userIds: string[],
): Promise<Map<string, AjustesPapel>> {
  const { data } = await supabase
    .from("paper_settings")
    .select("user_id, comision_pct, deslizamiento_pct")
    .in("user_id", [...new Set(userIds)]);

  return new Map(
    (data ?? []).map((s) => [
      s.user_id,
      {
        comisionPct: Number(s.comision_pct),
        deslizamientoPct: Number(s.deslizamiento_pct),
      },
    ]),
  );
}

type FilaPosicion = Database["public"]["Tables"]["paper_positions"]["Row"];

async function leerPosicionAbierta(
  supabase: ClienteSimulador,
  cuenta: FilaCuenta,
): Promise<FilaPosicion | null> {
  // Con el `user_id` puesto aunque el `bot_id` ya sea único entre las
  // abiertas: este cliente se salta la RLS, y lo único que impide que un
  // identificador equivocado toque la cuenta de otro es que el filtro esté
  // escrito. Es el mismo criterio que sigue el resto del trabajo de fondo.
  const { data } = await supabase
    .from("paper_positions")
    .select("*")
    .eq("bot_id", cuenta.bot_id)
    .eq("user_id", cuenta.user_id)
    .eq("status", "ABIERTA")
    .maybeSingle();

  return data ?? null;
}

function aPosicion(fila: FilaPosicion): PosicionAbierta {
  return {
    // Cualquier cosa que no sea CORTO se lee como LARGO. El check de la tabla
    // ya sólo admite esos dos valores; esto es lo que hace que la columna, que
    // es `text`, llegue al motor como el tipo que el motor promete.
    side: fila.side === "CORTO" ? "CORTO" : "LARGO",
    size: Number(fila.size),
    precioEntrada: Number(fila.precio_entrada),
    // De vuelta a segundos, que es la unidad en la que trabaja el motor.
    horaEntrada: Math.floor(new Date(fila.hora_entrada).getTime() / 1000),
    stop: fila.stop === null ? null : Number(fila.stop),
    objetivo: fila.objetivo === null ? null : Number(fila.objetivo),
    atrEntrada: fila.atr_entrada === null ? null : Number(fila.atr_entrada),
  };
}

// ---------------------------------------------------------------------------
// De lo que escribió el usuario a lo que entiende la fuente de datos
// ---------------------------------------------------------------------------

/**
 * El producto de Coinbase que corresponde al mercado del bot.
 *
 * `bots.market` es texto libre -- el formulario acepta lo que sea -- y ahí
 * conviven «COINBASE:BTCUSD» (como lo escribe TradingView), «BTC-USD» (como lo
 * llama Coinbase) y «BTC futuros (BIT)», que no es ninguna de las dos cosas.
 * Esto traduce las dos primeras formas y devuelve `null` para el resto.
 *
 * `null` y no una suposición: un bot cuyo mercado no se entiende se salta con
 * un motivo que la pantalla puede enseñar. Adivinar «BTC» de cualquier texto
 * que lo contenga acabaría simulando un futuro con el precio del contado, y
 * esa cifra parecería correcta.
 */
export function productoDeMercado(market: string): string | null {
  const limpio = market.trim().toUpperCase().replace(/\s+/g, "");
  // «COINBASE:BTCUSD» -> «BTCUSD». El prefijo de la bolsa no aporta nada: la
  // fuente es siempre Coinbase.
  const sinBolsa = limpio.includes(":") ? limpio.slice(limpio.lastIndexOf(":") + 1) : limpio;

  if (/^[A-Z0-9]{2,10}-[A-Z]{3,5}$/.test(sinBolsa)) return sinBolsa;

  const monedas = ["USDC", "USDT", "USD", "EUR", "GBP", "BTC"];
  for (const moneda of monedas) {
    if (sinBolsa.length > moneda.length && sinBolsa.endsWith(moneda)) {
      return `${sinBolsa.slice(0, -moneda.length)}-${moneda}`;
    }
  }

  return null;
}

/**
 * La granularidad que corresponde a la temporalidad del bot.
 *
 * `bots.timeframe` también es texto libre: «1D», «4h», «diario», «15m». Sólo
 * se traducen las seis que sirve la API pública de Coinbase; el resto devuelve
 * `null` y el bot se salta.
 *
 * Duele especialmente con 4h, que es la temporalidad de varias estrategias del
 * proyecto y que el endpoint público no sirve. Antes que simular un bot de 4h
 * con velas de 1h -- que es simular otra estrategia y llamarla igual -- se
 * prefiere no simularlo y decirlo.
 */
export function granularidadDeTemporalidad(timeframe: string): GranularidadPublica | null {
  const limpio = timeframe.trim().toLowerCase().replace(/\s+/g, "");
  if (esGranularidadPublica(limpio)) return limpio;

  const alias: Record<string, GranularidadPublica> = {
    "1": "1m",
    m1: "1m",
    "1min": "1m",
    "5": "5m",
    m5: "5m",
    "5min": "5m",
    "15": "15m",
    m15: "15m",
    "15min": "15m",
    "60": "1h",
    h1: "1h",
    "1hora": "1h",
    "360": "6h",
    h6: "6h",
    d: "1d",
    "1440": "1d",
    d1: "1d",
    diario: "1d",
    "1día": "1d",
    "1dia": "1d",
  };

  return alias[limpio] ?? null;
}

/**
 * Las velas, en segundos y sin la que está a medio formar.
 *
 * Lo de los segundos no es un capricho. En este repositorio conviven las dos
 * unidades: `Vela.time` es segundos allí donde la consumen los indicadores y
 * el motor de backtest (`buildContext` corta la sesión con `t / 86400`, y
 * `withinHours` hace `new Date(t * 1000)`), y `lib/coinbase/public-candles.ts`
 * las entrega en milisegundos. Alimentar el motor con milisegundos no daría
 * un error: daría un horario tres mil años en el futuro y un VWAP que nunca
 * se reinicia, que es peor porque parece que funciona.
 *
 * Se detecta la unidad por magnitud en vez de dividir a ciegas: así esto sigue
 * siendo correcto el día que la fuente cambie a segundos, en lugar de
 * convertirse en el bug que nadie relaciona con este archivo.
 */
function normalizarVelas(velas: Vela[]): Vela[] {
  return velas.map((v) => (v.time > 1e12 ? { ...v, time: Math.floor(v.time / 1000) } : v));
}

/**
 * Dos decimales para el dinero de la cuenta.
 *
 * El efectivo y el patrimonio son cifras en dólares que el usuario lee; los
 * precios y los tamaños no se redondean aquí, que ésos los cuadra el motor con
 * `Decimal`.
 */
function redondearDinero(valor: number): number {
  return Math.round(valor * 100) / 100;
}
