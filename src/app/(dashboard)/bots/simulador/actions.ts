"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import {
  SEGUNDOS_POR_GRANULARIDAD,
  velasPublicas,
  type GranularidadPublica,
} from "@/lib/coinbase/public-candles";
import {
  aplicarDeslizamiento,
  resultadoDeOperacion,
  valorDeCierre,
  type AjustesPapel,
  type LadoPapel,
  type PosicionAbierta,
} from "@/lib/paper/engine";
import {
  AJUSTES_DE_FABRICA,
  granularidadDeTemporalidad,
  productoDeMercado,
} from "@/lib/paper/runner";
import { createClient } from "@/lib/supabase/server";

/**
 * Lo que el usuario puede hacer con una cuenta de papel: encenderla, apagarla
 * y decidir cuánto dinero ficticio le presta.
 *
 * El ciclo del simulador (`lib/paper/runner.ts`) es quien abre y cierra
 * posiciones siguiendo la estrategia; aquí sólo están las dos decisiones que
 * toma una persona. Van con el cliente de sesión, no con el de servicio: esto
 * lo dispara alguien identificado y la RLS tiene que seguir aplicando. El
 * `.eq("user_id", ...)` de cada consulta es redundante con la política y está
 * puesto igual, por si algún día alguien copia una de estas funciones a un
 * contexto sin sesión.
 *
 * Nada de esto escribe en `audit_log`. El vocabulario de auditoría es un
 * conjunto cerrado (`lib/audit/actions.ts`) y no tiene todavía un verbo para
 * el simulador; meter «bot editado» por encender una cuenta de papel
 * ensuciaría el registro de actividad con algo que no es lo que dice ser.
 * Mientras tanto el rastro existe igual, y es mejor: `paper_accounts` guarda
 * `started_at` y `enabled`, y cada cierre por apagado queda en `paper_trades`
 * con motivo `APAGADO`.
 */

export interface ResultadoAccion {
  error: string | null;
}

/** El tope del capital que se le puede prestar a un bot. Es papel, pero no infinito. */
const CAPITAL_MAXIMO = 10_000_000;

function revalidarSimulador() {
  revalidatePath("/bots/simulador");
  revalidatePath("/bots");
}

/** Dos decimales, la misma unidad de dinero que usa el ciclo. */
function redondearDinero(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Encender o apagar la cuenta de un bot.
 *
 * Apagar con una posición abierta la cierra a mercado, con motivo `APAGADO`.
 * No es una comodidad: el ciclo sólo mira las cuentas encendidas, así que una
 * posición que sobrevive al apagado se queda sin nadie que vigile su stop y su
 * objetivo, envejeciendo con el patrimonio congelado en el último precio que
 * alguien miró. Es una cifra falsa que además crece sola.
 */
export async function encenderCuenta(input: {
  botId: string;
  encendido: boolean;
}): Promise<ResultadoAccion> {
  const user = await requireUser();
  if (!z.uuid().safeParse(input.botId).success) return { error: "Bot inválido." };

  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("paper_accounts")
    .select("id, efectivo, equity, started_at")
    .eq("bot_id", input.botId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cuenta) {
    return { error: "Este bot todavía no tiene cuenta de papel. Asígnale capital y se crea sola." };
  }

  if (input.encendido) {
    // Encender un bot sin dinero no falla en ninguna parte: simplemente el
    // ciclo lo salta con `SIN_CAPITAL` cada cinco minutos y el usuario ve un
    // bot «encendido» que nunca opera. Mejor no dejar encenderlo y decir por
    // qué.
    if (Number(cuenta.equity) <= 0) {
      return { error: "No le queda dinero en la cuenta. Súbele el capital antes de encenderlo." };
    }

    const { error } = await supabase
      .from("paper_accounts")
      .update({
        enabled: true,
        // La constraint `paper_accounts_encendida_con_fecha` exige la fecha
        // junto con el interruptor. Se conserva la primera: `started_at` es
        // cuándo empezó a operar este bot, y un apagado de una tarde no
        // reinicia esa cuenta atrás.
        started_at: cuenta.started_at ?? new Date().toISOString(),
      })
      .eq("id", cuenta.id)
      .eq("user_id", user.id);

    if (error) return { error: "No se pudo encender la cuenta." };
    revalidarSimulador();
    return { error: null };
  }

  const { data: posicion } = await supabase
    .from("paper_positions")
    .select("*")
    .eq("bot_id", input.botId)
    .eq("user_id", user.id)
    .eq("status", "ABIERTA")
    .maybeSingle();

  if (!posicion) {
    const { error } = await supabase
      .from("paper_accounts")
      .update({ enabled: false })
      .eq("id", cuenta.id)
      .eq("user_id", user.id);

    if (error) return { error: "No se pudo apagar la cuenta." };
    revalidarSimulador();
    return { error: null };
  }

  const { data: bot } = await supabase
    .from("bots")
    .select("market, timeframe")
    .eq("id", input.botId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!bot) return { error: "Ese bot no existe." };

  const producto = productoDeMercado(bot.market);
  const granularidad = granularidadDeTemporalidad(bot.timeframe);

  // Sin precio no se cierra, y sin cerrar no se apaga. Es deliberado que el
  // interruptor se quede como está en vez de apagarse dejando la posición
  // abierta: un bot encendido de más es un ciclo que sigue vigilando el stop,
  // y un bot apagado con posición viva es exactamente el huérfano que esto
  // intenta evitar. El mercado o la temporalidad ilegibles se arreglan
  // editando el bot; la caída de la API se arregla reintentando.
  if (!producto || !granularidad) {
    return {
      error: `Tiene una posición abierta y no se puede pedir su precio: «${bot.market}» a «${bot.timeframe}» no es un mercado que sepamos leer. Corrige el mercado del bot y vuelve a apagarlo.`,
    };
  }

  const precioMercado = await precioAhora(producto, granularidad);
  if (precioMercado === null) {
    return {
      error: "Tiene una posición abierta y el mercado no responde ahora mismo. Vuelve a intentarlo en un momento: apagarlo sin cerrarla dejaría la posición sin vigilancia.",
    };
  }

  const ajustes = await leerAjustes(supabase, user.id);
  const abierta = aPosicion(posicion);

  // La misma salida que aplica el ciclo: se sale por el lado contrario al que
  // se entró y el deslizamiento va en contra. Un cierre manual que se ejecuta
  // al precio exacto de pantalla haría que apagar bots pareciera gratis.
  const precioSalida = aplicarDeslizamiento(
    precioMercado,
    abierta.side === "LARGO" ? "VENTA" : "COMPRA",
    ajustes.deslizamientoPct,
  );

  const ahora = new Date();

  // Primero cerrar exigiendo que estuviera abierta, después escribir la
  // operación -- el mismo orden que `escribirCierre` en el ciclo, y por lo
  // mismo: si el cron cerró la posición hace un segundo, este `update` no
  // toca ninguna fila y no se duplica la operación en el histórico.
  const { data: tocadas, error: errorCierre } = await supabase
    .from("paper_positions")
    .update({ status: "CERRADA" })
    .eq("id", posicion.id)
    .eq("user_id", user.id)
    .eq("status", "ABIERTA")
    .select("id");

  if (errorCierre) return { error: "No se pudo cerrar la posición." };

  /**
   * Sólo se toca el dinero si el cierre fue nuestro.
   *
   * Cuando el `update` de arriba no encuentra la posición abierta es porque el
   * ciclo la cerró en el segundo que ha pasado desde que se leyó la cuenta, y
   * entonces él ya escribió el efectivo y el patrimonio buenos. Escribirlos
   * aquí encima con los que se leyeron antes del cierre devolvería la cuenta a
   * la foto anterior y le regalaría al bot el dinero de una posición que ya no
   * tiene.
   */
  const cambios: { enabled: false; efectivo?: number; equity?: number } = { enabled: false };

  if (tocadas && tocadas.length > 0) {
    const resultado = resultadoDeOperacion({
      side: abierta.side,
      size: abierta.size,
      precioEntrada: abierta.precioEntrada,
      precioSalida,
      comisionPct: ajustes.comisionPct,
    });

    const { error } = await supabase.from("paper_trades").insert({
      user_id: user.id,
      bot_id: input.botId,
      position_id: posicion.id,
      side: abierta.side,
      size: abierta.size,
      precio_entrada: abierta.precioEntrada,
      hora_entrada: posicion.hora_entrada,
      precio_salida: precioSalida,
      hora_salida: ahora.toISOString(),
      pnl: resultado.pnl,
      pnl_pct: resultado.pnlPct,
      comision: resultado.comision,
      motivo_salida: "APAGADO",
      barras_en_mercado: barrasTranscurridas(abierta.horaEntrada, granularidad, ahora),
    });

    // La posición ya está cerrada aunque la operación no se haya podido
    // escribir. Se avisa y no se apaga la cuenta: reintentar el apagado no
    // hará daño (no hay posición que cerrar dos veces) y deja constancia de
    // que falta una fila en el histórico.
    if (error) return { error: "La posición se cerró pero no se pudo guardar la operación. Vuelve a intentarlo." };

    const efectivo = Math.max(
      0,
      redondearDinero(
        Number(cuenta.efectivo) + valorDeCierre(abierta, precioSalida, ajustes.comisionPct),
      ),
    );

    cambios.efectivo = efectivo;
    // Sin posición abierta el patrimonio ES el efectivo. Se escriben los dos
    // para que la pantalla no enseñe un patrimonio viejo hasta el próximo ciclo.
    cambios.equity = efectivo;
  }

  const { error } = await supabase
    .from("paper_accounts")
    .update(cambios)
    .eq("id", cuenta.id)
    .eq("user_id", user.id);

  if (error) return { error: "La posición se cerró pero no se pudo apagar la cuenta. Vuelve a intentarlo." };

  revalidarSimulador();
  return { error: null };
}

/**
 * Cambiar el capital que el bot tiene prestado.
 *
 * **Qué pasa si se baja por debajo del patrimonio actual.** Un cambio de
 * capital se trata como un ingreso o una retirada por la diferencia, y esa
 * diferencia va contra el efectivo: subir de 10.000 a 15.000 mete 5.000 en la
 * cuenta, bajar de 10.000 a 8.000 saca 2.000. Nunca se toca lo ganado ni lo
 * perdido.
 *
 * La consecuencia es que bajar el capital por debajo del patrimonio no
 * confisca los beneficios: un bot con 10.000 prestados y 12.000 de patrimonio
 * al que se le baja el capital a 8.000 se queda con 10.000 de patrimonio y
 * sigue ganando 2.000. Y al revés: uno que perdió mantiene su pérdida. Es lo
 * que hace que el P&L (patrimonio menos capital) signifique siempre lo mismo
 * -- lo que ha hecho la estrategia -- en vez de moverse cada vez que alguien
 * ajusta el reparto. La alternativa, «bajar el capital baja el patrimonio a
 * ese número», borraría el resultado del bot con un campo de formulario.
 *
 * Lo que sí se rechaza es sacar dinero que está dentro de una posición
 * abierta. Ese dinero no existe como efectivo hasta que la posición se cierre,
 * y sacarlo obligaría a cerrarla antes de tiempo -- una operación que la
 * estrategia no pidió y que ensuciaría su histórico.
 */
export async function cambiarCapital(input: {
  botId: string;
  capital: number;
}): Promise<ResultadoAccion> {
  const user = await requireUser();
  if (!z.uuid().safeParse(input.botId).success) return { error: "Bot inválido." };

  const capital = z.number().min(0).max(CAPITAL_MAXIMO).safeParse(input.capital);
  if (!capital.success) {
    return { error: `El capital va de 0 a ${CAPITAL_MAXIMO.toLocaleString("es-ES")}.` };
  }
  const nuevo = redondearDinero(capital.data);

  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("paper_accounts")
    .select("id, capital_asignado, efectivo, equity")
    .eq("bot_id", input.botId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cuenta) {
    // Primera vez: la cuenta se abre aquí. Las tres columnas de dinero no
    // tienen valor por defecto en la tabla y valen lo mismo al principio,
    // porque sin posición abierta el patrimonio es el efectivo y el efectivo
    // es todo lo prestado.
    const { data: bot } = await supabase
      .from("bots")
      .select("id")
      .eq("id", input.botId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!bot) return { error: "Ese bot no existe." };

    const { error } = await supabase.from("paper_accounts").insert({
      user_id: user.id,
      bot_id: input.botId,
      enabled: false,
      capital_asignado: nuevo,
      efectivo: nuevo,
      equity: nuevo,
    });

    if (error) {
      // El único por bot: dos pestañas abriendo la misma cuenta a la vez.
      if (error.code === "23505") return { error: "Esa cuenta ya existía. Recarga la pantalla." };
      return { error: "No se pudo abrir la cuenta de papel." };
    }

    revalidarSimulador();
    return { error: null };
  }

  const anterior = Number(cuenta.capital_asignado);
  const efectivo = Number(cuenta.efectivo);
  const equity = Number(cuenta.equity);
  const diferencia = redondearDinero(nuevo - anterior);

  if (diferencia === 0) return { error: null };

  if (diferencia < 0 && -diferencia > efectivo + 0.001) {
    const dentro = redondearDinero(equity - efectivo);
    return {
      error: `Sólo hay ${efectivo.toFixed(2)} libres: los otros ${dentro.toFixed(2)} están dentro de una posición abierta. Apaga el bot para cerrarla, o baja el capital menos.`,
    };
  }

  // Leer, sumar y escribir, con lo que un ciclo que caiga justo en medio se
  // pierde: sus cifras quedarían pisadas por las de hace un instante más el
  // ingreso. La ventana es de milisegundos y el ciclo pasa cada cinco minutos,
  // así que se acepta antes que añadir una función en la base para sumar en
  // el propio `update`. Si algún día el ciclo baja de un minuto, deja de ser
  // aceptable.
  const { error } = await supabase
    .from("paper_accounts")
    .update({
      capital_asignado: nuevo,
      efectivo: Math.max(0, redondearDinero(efectivo + diferencia)),
      equity: Math.max(0, redondearDinero(equity + diferencia)),
    })
    .eq("id", cuenta.id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo cambiar el capital." };

  revalidarSimulador();
  return { error: null };
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

type ClienteSesion = Awaited<ReturnType<typeof createClient>>;

/** Los costes del usuario, o los de fábrica si nunca los tocó. */
async function leerAjustes(supabase: ClienteSesion, userId: string): Promise<AjustesPapel> {
  const { data } = await supabase
    .from("paper_settings")
    .select("comision_pct, deslizamiento_pct")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return AJUSTES_DE_FABRICA;
  return {
    comisionPct: Number(data.comision_pct),
    deslizamientoPct: Number(data.deslizamiento_pct),
  };
}

/**
 * El precio de ahora, no el del último cierre de la temporalidad del bot.
 *
 * Se piden velas de un minuto aunque el bot opere en diario: «cerrar a
 * mercado» significa al precio de este momento, y el cierre de la vela diaria
 * de ayer puede llevar veinte horas de retraso. Si el minuto no llega -- un
 * producto poco líquido, la API cansada -- se cae a la temporalidad del bot,
 * que es peor precio pero sigue siendo un precio real.
 */
async function precioAhora(
  producto: string,
  granularidad: GranularidadPublica,
): Promise<number | null> {
  const alMinuto = await velasPublicas(producto, "1m", 1);
  if (alMinuto.length > 0) return alMinuto[alMinuto.length - 1].close;

  const propias = await velasPublicas(producto, granularidad, 1);
  if (propias.length > 0) return propias[propias.length - 1].close;

  return null;
}

/**
 * Cuántas velas lleva abierta la posición, contadas por reloj.
 *
 * `barrasEnMercado` del motor necesita el histórico entero de velas para
 * localizar la entrada; aquí no hace falta pedirlo, porque el cripto cotiza sin
 * parar y entre dos instantes caben exactamente las velas que quepan. En un
 * mercado con horario esto sobrecontaría los fines de semana, y entonces
 * habría que volver al helper del motor.
 */
function barrasTranscurridas(
  horaEntradaSegundos: number,
  granularidad: GranularidadPublica,
  ahora: Date,
): number {
  const segundos = Math.floor(ahora.getTime() / 1000) - horaEntradaSegundos;
  return Math.max(0, Math.floor(segundos / SEGUNDOS_POR_GRANULARIDAD[granularidad]));
}

/** La fila de la base, como la entiende el motor. */
function aPosicion(fila: {
  side: string;
  size: string;
  precio_entrada: string;
  hora_entrada: string;
  stop: string | null;
  objetivo: string | null;
  atr_entrada: string | null;
}): PosicionAbierta {
  const side: LadoPapel = fila.side === "CORTO" ? "CORTO" : "LARGO";
  return {
    side,
    size: Number(fila.size),
    precioEntrada: Number(fila.precio_entrada),
    // El motor trabaja en segundos; la columna es `timestamptz`.
    horaEntrada: Math.floor(new Date(fila.hora_entrada).getTime() / 1000),
    stop: fila.stop === null ? null : Number(fila.stop),
    objetivo: fila.objetivo === null ? null : Number(fila.objetivo),
    atrEntrada: fila.atr_entrada === null ? null : Number(fila.atr_entrada),
  };
}
