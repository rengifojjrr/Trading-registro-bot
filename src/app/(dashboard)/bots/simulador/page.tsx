import { FlaskConical, Plus } from "lucide-react";
import Link from "next/link";

import { SimuladorPanel, type FilaSimulador, type PosicionEnPantalla } from "@/components/bots/simulador-panel";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseStoredStrategy } from "@/lib/backtest/persistence";
import { validateStrategy } from "@/lib/backtest/rules";
import { readBotContext } from "@/lib/bots/queries";
import { formatMoney, formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";
import { granularidadDeTemporalidad, productoDeMercado } from "@/lib/paper/runner";
import { createClient } from "@/lib/supabase/server";

/**
 * El simulador: todos los bots operando a la vez con dinero ficticio.
 *
 * Es la pantalla que contesta «¿esto funcionaría?» sin arriesgar nada. Arriba,
 * el conjunto -- lo repartido, lo que vale ahora y cuánto ha caído por el
 * camino --, porque un simulador donde cada bot se mira por separado esconde
 * justo lo que hace daño: que se hundan todos a la vez. Debajo, una fila por
 * bot con los mandos.
 *
 * Las cifras de cada cuenta son las que dejó el último ciclo, no las de este
 * instante: el patrimonio de un bot con posición abierta está marcado al
 * precio de la última vela que se evaluó. Por eso cada fila enseña cuándo se
 * la miró por última vez.
 */

/** Cuántos puntos de curva se leen para la caída conjunta. */
const MAX_PUNTOS_DE_CURVA = 5000;

const DESCRIPCION =
  "Todos los bots operando a la vez con dinero ficticio, con los mismos costes que tendrían de verdad.";

export default async function SimuladorPage() {
  const { userId, timezone, currency } = await readBotContext();
  const supabase = await createClient();

  const [
    { data: bots, error: errorBots },
    { data: cuentas, error: errorCuentas },
    { data: posiciones, error: errorPosiciones },
    { data: operaciones },
    { data: puntos },
    { data: ajustes },
  ] = await Promise.all([
    supabase
      .from("bots")
      .select("id, name, market, timeframe, familia_operativa, phase, backtest_strategy_id")
      .eq("user_id", userId)
      .order("name", { ascending: true }),
    supabase
      .from("paper_accounts")
      .select("bot_id, enabled, capital_asignado, efectivo, equity, last_tick_at")
      .eq("user_id", userId),
    supabase
      .from("paper_positions")
      .select("bot_id, side, size, precio_entrada, hora_entrada, stop, objetivo")
      .eq("user_id", userId)
      .eq("status", "ABIERTA"),
    supabase.from("paper_trades").select("bot_id").eq("user_id", userId),
    // Descendente y con tope: la caída conjunta se mide sobre el tramo
    // reciente de la curva, no sobre toda la historia. Un bot de un minuto
    // deja 1.440 puntos al día y sin tope esta consulta crecería sin
    // límite; cortar por el final es quedarse con lo último, que es lo que
    // la pantalla está enseñando.
    supabase
      .from("paper_equity_points")
      .select("bot_id, ts, equity")
      .eq("user_id", userId)
      .order("ts", { ascending: false })
      .limit(MAX_PUNTOS_DE_CURVA),
    supabase.from("paper_settings").select("capital_por_defecto").eq("user_id", userId).maybeSingle(),
  ]);

  // Las tres primeras consultas se dan por buenas o no se pinta nada. Una
  // `paper_accounts` que falla en silencio enseñaría todos los bots como «sin
  // cuenta», y lo siguiente que haría el usuario sería volver a abrirlas
  // encima de las que ya existen. Las otras tres (operaciones, curva y
  // ajustes) sí pueden faltar: se degradan a un contador a cero, una caída
  // sin medir y el capital de fábrica.
  if (errorBots) throw new Error(`Simulador: no se pudieron leer los bots -- ${errorBots.message}`);
  if (errorCuentas) throw new Error(`Simulador: no se pudieron leer las cuentas -- ${errorCuentas.message}`);
  if (errorPosiciones) {
    throw new Error(`Simulador: no se pudieron leer las posiciones -- ${errorPosiciones.message}`);
  }

  const listaBots = bots ?? [];
  const porBot = new Map((cuentas ?? []).map((c) => [c.bot_id, c]));
  const abiertas = new Map((posiciones ?? []).map((p) => [p.bot_id, p]));

  const conteo = new Map<string, number>();
  for (const t of operaciones ?? []) conteo.set(t.bot_id, (conteo.get(t.bot_id) ?? 0) + 1);

  const problemas = await problemasDeCadaBot(supabase, listaBots);

  const filas: FilaSimulador[] = listaBots
    // Un bot retirado no se simula: lo que se aprende de él ya está escrito en
    // su lápida. Se queda en la lista sólo si todavía tiene cuenta abierta,
    // porque entonces hay dinero ficticio suyo que alguien tiene que retirar.
    .filter((b) => b.phase !== "RETIRADO" || porBot.has(b.id))
    .map((b) => {
      const cuenta = porBot.get(b.id);
      const capital = cuenta ? Number(cuenta.capital_asignado) : null;
      const equity = cuenta ? Number(cuenta.equity) : null;
      const pnl = capital !== null && equity !== null ? redondear(equity - capital) : null;

      return {
        botId: b.id,
        nombre: b.name,
        familia: b.familia_operativa,
        mercado: b.market,
        temporalidad: b.timeframe,
        capital,
        equity,
        pnl,
        // Sin capital prestado no hay porcentaje que sacar, y un bot con 0
        // asignado y 0 de patrimonio no ha ganado un infinito por ciento.
        pnlPct: pnl !== null && capital !== null && capital > 0 ? (pnl / capital) * 100 : null,
        encendido: cuenta?.enabled ?? false,
        operaciones: conteo.get(b.id) ?? 0,
        posicion: aPosicionEnPantalla(abiertas.get(b.id)),
        ultimoTick: cuenta?.last_tick_at ?? null,
        problema: problemas.get(b.id) ?? null,
      } satisfies FilaSimulador;
    })
    // Encendidos primero, después los que tienen cuenta y por último los que
    // ni siquiera la han abierto: la pantalla se lee de arriba abajo y lo que
    // está operando es lo que hay que mirar cada día.
    .sort((a, b) => {
      const orden = (f: FilaSimulador) => (f.encendido ? 0 : f.capital === null ? 2 : 1);
      return orden(a) - orden(b) || a.nombre.localeCompare(b.nombre, "es");
    });

  if (filas.length === 0) {
    return (
      <>
        <PageHeader title="Simulador" description={DESCRIPCION} />
        <EmptyState
          icon={FlaskConical}
          title="No hay bots que simular"
          description="El simulador corre las reglas de cada bot contra el precio real y le lleva la cuenta con dinero ficticio. Da de alta un bot, guárdale unas reglas y aquí podrás encenderlo."
          action={
            <Button asChild size="sm">
              <Link href="/bots/nuevo">
                <Plus className="size-4" aria-hidden />
                Dar de alta un bot
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const capitalTotal = redondear(filas.reduce((suma, f) => suma + (f.capital ?? 0), 0));
  const equityTotal = redondear(filas.reduce((suma, f) => suma + (f.equity ?? 0), 0));
  const pnlTotal = redondear(equityTotal - capitalTotal);
  const encendidos = filas.filter((f) => f.encendido).length;
  const conCuenta = filas.filter((f) => f.capital !== null).length;
  const caida = caidaMaximaConjunta(puntos ?? []);

  return (
    <>
      <PageHeader title="Simulador" description={DESCRIPCION} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          size="lg"
          label="Capital repartido"
          value={formatMoney(capitalTotal, { currency, compact: true })}
          sub={`${conCuenta} de ${filas.length} bots con cuenta`}
          description="La suma de lo que has prestado a cada bot. Es dinero ficticio: sirve para que el tamaño de cada orden sea el que sería de verdad."
        />
        <StatTile
          size="lg"
          label="Patrimonio ahora"
          value={formatMoney(equityTotal, { currency, compact: true })}
          sub="Efectivo más posiciones abiertas"
          description="Efectivo más lo que devolvería cerrar ahora las posiciones abiertas, valoradas al precio de la última vela evaluada. No es un precio en directo."
        />
        <StatTile
          size="lg"
          label="P&L del conjunto"
          value={formatSignedMoney(pnlTotal, { currency, compact: true })}
          tone={pnlTone(pnlTotal)}
          sub={capitalTotal > 0 ? formatPercent((pnlTotal / capitalTotal) * 100, 2) : "Sin capital repartido"}
          description="Patrimonio menos capital repartido. Cambiar el capital de un bot no lo mueve: un ingreso o una retirada suben y bajan las dos cifras a la vez."
        />
        <StatTile
          size="lg"
          label="Encendidos"
          value={encendidos}
          sub={encendidos === 0 ? "Nadie está operando" : `de ${filas.length} bots`}
          description="Bots cuya cuenta está encendida. El ciclo sólo mira ésos, y cada cinco minutos evalúa una vela de cada uno."
        />
        <StatTile
          size="lg"
          label="Caída máxima"
          value={caida === null ? "--" : `${caida.toFixed(1)}%`}
          tone={caida === null || caida === 0 ? "neutral" : "negative"}
          sub={caida === null ? "Falta curva que medir" : "Sobre la curva conjunta"}
          description="La mayor bajada desde un máximo de la curva de todos los bots sumados, que es la que importa: los bots se hunden a la vez más de lo que parece mirándolos uno a uno. Cambiar el capital de un bot mueve la curva de golpe y ahí la caída no es suya."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bot a bot</CardTitle>
        </CardHeader>
        <CardContent>
          <SimuladorPanel
            filas={filas}
            moneda={currency}
            zona={timezone}
            capitalPorDefecto={ajustes ? Number(ajustes.capital_por_defecto) : 10000}
          />
        </CardContent>
      </Card>
    </>
  );
}

type ClienteSesion = Awaited<ReturnType<typeof createClient>>;

type FilaBot = {
  id: string;
  name: string;
  market: string;
  timeframe: string;
  familia_operativa: string | null;
  phase: string;
  backtest_strategy_id: string | null;
};

/**
 * Por qué el ciclo se saltaría cada bot, si es que se lo salta.
 *
 * Se comprueba con las mismas funciones que usa el ciclo -- `productoDeMercado`
 * y `granularidadDeTemporalidad` -- en vez de con una lista de mercados
 * escrita aquí. Si mañana el simulador aprende a leer un mercado más, esta
 * pantalla se entera sola; con una lista paralela diría «no puedo» de algo que
 * lleva un mes funcionando.
 *
 * Se avisa aquí y no cuando el bot ya lleva una semana encendido sin operar,
 * que es la forma cara de descubrir que la temporalidad no existía.
 */
async function problemasDeCadaBot(
  supabase: ClienteSesion,
  bots: FilaBot[],
): Promise<Map<string, string>> {
  const ids = [...new Set(bots.map((b) => b.backtest_strategy_id).filter((id): id is string => id !== null))];

  const reglasRotas = new Set<string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("backtest_strategies").select("id, rules").in("id", ids);
    for (const fila of data ?? []) {
      if (validateStrategy(parseStoredStrategy(fila.rules)).length > 0) reglasRotas.add(fila.id);
    }
  }

  const problemas = new Map<string, string>();

  for (const b of bots) {
    if (!b.backtest_strategy_id) {
      problemas.set(b.id, "No tiene reglas guardadas, así que el ciclo no puede evaluarlo.");
      continue;
    }
    if (reglasRotas.has(b.backtest_strategy_id)) {
      problemas.set(b.id, "Sus reglas guardadas no se pueden correr: edítalas en el backtest.");
      continue;
    }
    if (!productoDeMercado(b.market)) {
      problemas.set(b.id, `«${b.market}» no es un mercado del que se pueda pedir precio.`);
      continue;
    }
    if (!granularidadDeTemporalidad(b.timeframe)) {
      problemas.set(b.id, `No hay velas públicas de ${b.timeframe}: el simulador no puede correrlo.`);
    }
  }

  return problemas;
}

function aPosicionEnPantalla(
  fila:
    | {
        side: string;
        size: string;
        precio_entrada: string;
        hora_entrada: string;
        stop: string | null;
        objetivo: string | null;
      }
    | undefined,
): PosicionEnPantalla | null {
  if (!fila) return null;
  return {
    // El check de la tabla ya sólo admite los dos valores; esto es lo que hace
    // que una columna `text` llegue a la interfaz con el tipo que promete.
    lado: fila.side === "CORTO" ? "CORTO" : "LARGO",
    size: Number(fila.size),
    precioEntrada: Number(fila.precio_entrada),
    stop: fila.stop === null ? null : Number(fila.stop),
    objetivo: fila.objetivo === null ? null : Number(fila.objetivo),
    horaEntrada: fila.hora_entrada,
  };
}

/**
 * La mayor caída de la curva de todos los bots sumados, en porcentaje.
 *
 * Los puntos de cada bot caen en las horas de SU vela: un bot diario deja uno
 * al día y uno de quince minutos noventa y seis, así que sumar sólo lo que
 * coincide en el mismo instante daría una curva que se desploma cada vez que
 * un bot no tiene punto ahí. Por eso cada bot arrastra su último valor
 * conocido hacia adelante, y hacia atrás el primero: un bot que se enciende
 * hoy no puede aparecer como un salto de patrimonio de la nada, porque ese
 * salto se leería como una ganancia enorme y aplastaría la caída real de los
 * demás.
 */
function caidaMaximaConjunta(puntos: { bot_id: string; ts: string; equity: string }[]): number | null {
  if (puntos.length === 0) return null;

  const porBot = new Map<string, { ts: number; equity: number }[]>();
  for (const p of puntos) {
    const lista = porBot.get(p.bot_id) ?? [];
    lista.push({ ts: new Date(p.ts).getTime(), equity: Number(p.equity) });
    porBot.set(p.bot_id, lista);
  }
  for (const lista of porBot.values()) lista.sort((a, b) => a.ts - b.ts);

  const tiempos = [...new Set(puntos.map((p) => new Date(p.ts).getTime()))].sort((a, b) => a - b);
  if (tiempos.length < 2) return null;

  // Un índice por bot que sólo avanza: la curva se recorre una vez, no una por
  // bot y por instante.
  const cursores = new Map<string, number>();
  for (const bot of porBot.keys()) cursores.set(bot, 0);

  let pico = 0;
  let peor = 0;

  for (const t of tiempos) {
    let total = 0;

    for (const [bot, lista] of porBot) {
      let i = cursores.get(bot) ?? 0;
      while (i + 1 < lista.length && lista[i + 1].ts <= t) i += 1;
      cursores.set(bot, i);
      // Antes de su primer punto vale su primer punto, no cero.
      total += lista[i].ts <= t ? lista[i].equity : lista[0].equity;
    }

    if (total > pico) pico = total;
    if (pico > 0) {
      const caida = ((pico - total) / pico) * 100;
      if (caida > peor) peor = caida;
    }
  }

  return redondear(peor);
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
