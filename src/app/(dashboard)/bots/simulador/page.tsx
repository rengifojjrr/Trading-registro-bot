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
import { formatDate, formatMoney, formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";
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

const DESCRIPCION =
  "Todos los bots operando a la vez con dinero ficticio, con los mismos costes que tendrían de verdad.";

// Siempre fresca: el ciclo escribe por detrás cada cinco minutos y la caché
// de rutas del navegador devolvería el estado de hace medio minuto al volver.
export const dynamic = "force-dynamic";

export default async function SimuladorPage() {
  const { userId, timezone, currency } = await readBotContext();
  const supabase = await createClient();

  const [
    { data: bots, error: errorBots },
    { data: cuentas, error: errorCuentas },
    { data: posiciones, error: errorPosiciones },
    { data: operaciones },
    { data: caidas },
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
    // La caída conjunta la calcula la base. Aquí se hacía sumando las curvas
    // de los dieciocho bots en memoria, y para eso había que traerse los
    // puntos; como son decenas de miles, la consulta llevaba un tope de cinco
    // mil filas. Cortar por filas no acota el peso, acota el periodo: el tope
    // dejaba las últimas cuarenta y ocho horas de una historia de dos semanas
    // y el número salía casi dieciocho veces más pequeño que el de verdad
    // --«caída máxima 0,8%» al lado de «P&L -7,2%»--. Ver la migración
    // `20260917180000_la_caida_conjunta_sobre_toda_la_curva.sql`.
    supabase.rpc("paper_caida_maxima_conjunta"),
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
  const caida = (caidas ?? [])[0] ?? null;

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
          value={caida === null ? "--" : `${Number(caida.caida_pct).toFixed(1)}%`}
          tone={caida === null || Number(caida.caida_pct) === 0 ? "neutral" : "negative"}
          // Las dos fechas y las dos cifras, porque una caída sin episodio no
          // se puede comprobar: con ellas se puede ir a la curva de esos días
          // y ver qué pasó, y se ve de un vistazo si fue un desplome de una
          // tarde o un desgaste de dos semanas.
          sub={
            caida === null ? (
              "Falta curva que medir"
            ) : (
              <>
                De {formatMoney(caida.pico, { currency, compact: true })} el{" "}
                {formatDate(caida.pico_ts, timezone)} a{" "}
                {formatMoney(caida.valle, { currency, compact: true })} el{" "}
                {formatDate(caida.valle_ts, timezone)}
              </>
            )
          }
          description="La mayor bajada desde un máximo de la curva de todos los bots sumados, sobre toda la historia. Es la que importa: los bots se hunden a la vez más de lo que parece mirándolos uno a uno. Cambiar el capital de un bot mueve la curva de golpe y ahí la caída no es suya."
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

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
