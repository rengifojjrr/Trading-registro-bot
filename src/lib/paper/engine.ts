import { Decimal } from "decimal.js";

import {
  allHold,
  anyHolds,
  indicatorsUsed,
  withinHours,
  type EvaluationContext,
} from "@/lib/backtest/rules";
import type { Strategy } from "@/lib/backtest/types";
import { computeIndicator, isIndicatorId, type Serie, type Vela } from "@/lib/charts/indicators";

/**
 * El motor del simulador en papel: qué hacer al cerrar una vela.
 *
 * Puro a propósito, y con la misma insistencia que el motor de backtest: ni
 * base de datos, ni red, ni reloj. Recibe el histórico hasta la vela que se
 * está evaluando, la estrategia, lo que hay abierto y los costes, y devuelve
 * una acción. Nada más.
 *
 * Que sea puro no es higiene, es la única forma de que la simulación se pueda
 * comprobar. Un motor que leyera la hora decidiría distinto en cada ejecución
 * y no habría manera de reproducir «por qué abrió aquí»; uno que leyera la
 * base mezclaría un fallo de escritura con un fallo de criterio, que son dos
 * problemas que se arreglan en sitios distintos.
 *
 * Comparte con el motor de backtest todo lo que se puede compartir -- las
 * condiciones (`lib/backtest/rules.ts`), el horario, los niveles en múltiplos
 * del ATR -- porque el papel existe para contrastarse con el backtest. Dos
 * motores que evalúan «cruza hacia arriba» de dos formas distintas convierten
 * esa comparación en ruido.
 *
 * Donde sí se separan es en la ejecución, y por un motivo que no es una
 * elección: el backtest tiene la vela siguiente y el papel no. Ver
 * `evaluarVela`.
 */

export type LadoPapel = "LARGO" | "CORTO";

/**
 * Por qué se cerró una operación simulada.
 *
 * Espeja el check de `paper_trades.motivo_salida`. El motor sólo produce los
 * cuatro primeros; `MANUAL` (el usuario cierra esta operación) y `APAGADO` (el
 * usuario apaga la cuenta con la posición abierta) los escribe quien atiende
 * al usuario. Están aquí igualmente para que exista un solo sitio donde se
 * enumeran, y no dos listas que se desincronizan.
 */
export type MotivoSalida = "STOP" | "OBJETIVO" | "TIEMPO" | "CONDICION" | "MANUAL" | "APAGADO";

/** Lo que el bot tiene abierto, tal y como lo necesita el motor. */
export interface PosicionAbierta {
  side: LadoPapel;
  size: number;
  /** Ya con el deslizamiento aplicado: es al precio al que se entró de verdad. */
  precioEntrada: number;
  /**
   * La hora de apertura de la vela en la que se entró, en SEGUNDOS -- la
   * misma unidad que `Vela.time`. Se guarda la hora y no un contador de velas
   * porque un contador habría que llevarlo entre ciclos, y un ciclo que se
   * salta (un fallo de red, un despliegue) lo dejaría mintiendo para siempre.
   * Desde la hora, el número de velas se recalcula solo.
   */
  horaEntrada: number;
  stop: number | null;
  objetivo: number | null;
  atrEntrada: number | null;
}

/** Los costes de la simulación. Vienen de `paper_settings`, uno por usuario. */
export interface AjustesPapel {
  /** Porcentaje sobre el importe, cobrado en las dos puntas. */
  comisionPct: number;
  /** Porcentaje sobre el precio, siempre en contra. */
  deslizamientoPct: number;
}

export type AccionPaper =
  | {
      tipo: "ABRIR";
      side: LadoPapel;
      precio: number;
      stop: number | null;
      objetivo: number | null;
      atr: number | null;
    }
  | { tipo: "CERRAR"; precio: number; motivo: MotivoSalida }
  | { tipo: "NADA" };

/**
 * Qué hacer al cerrar la última vela de `velas`.
 *
 * Tres reglas mandan aquí, y las tres existen para que la simulación no
 * mienta:
 *
 *   1. **Se evalúa la vela CERRADA, nunca la que está en curso.** La última
 *      de `velas` tiene que ser una vela terminada -- de eso se encarga quien
 *      llama. Una señal leída sobre una vela a medio formar desaparece cuando
 *      la vela se cierra distinta, y un simulador que las lea así se está
 *      dando a sí mismo información que en vivo no tendría. Es exactamente el
 *      mismo error que hace que un backtest salga espectacular y la
 *      estrategia pierda dinero en cuanto se opera de verdad.
 *
 *   2. **El stop y el objetivo se miran antes que la entrada, y contra el
 *      máximo y el mínimo de la vela, no contra el cierre.** Una vela que se
 *      hundió hasta el stop y volvió a subir cerró arriba, pero la orden ya
 *      se había ejecutado abajo. Mirar sólo el cierre borra del histórico las
 *      peores operaciones de la estrategia.
 *
 *   3. **Si en la misma vela se tocan el stop y el objetivo, gana el stop.**
 *      Con velas no se puede saber cuál se tocó antes; suponer que fue el
 *      objetivo es la suposición que hace que la estrategia salga mejor de lo
 *      que es. Sin datos de tick, el supuesto conservador es el único
 *      defendible.
 *
 * Y una diferencia con el motor de backtest que conviene tener presente al
 * comparar los dos: allí una decisión tomada en la vela `i` se ejecuta a la
 * apertura de la `i+1`, porque el backtest ya tiene esa vela. Aquí no existe
 * todavía -- el precio de referencia es el cierre de la vela que acaba de
 * terminar, que es lo que se ve en pantalla en el momento de decidir. Lo que
 * cubre la diferencia entre ese cierre y el precio al que se ejecutaría de
 * verdad es el deslizamiento, y por eso no es un adorno configurable: es la
 * pieza que hace honesta la cifra.
 */
export function evaluarVela(entrada: {
  /** Histórico hasta la vela actual; la última es la que se evalúa. */
  velas: Vela[];
  estrategia: Strategy;
  posicion: PosicionAbierta | null;
  ajustes: AjustesPapel;
  sessionOf: (time: number) => string;
}): AccionPaper {
  const { velas, estrategia, posicion, ajustes, sessionOf } = entrada;

  // Con una sola vela no hay «vela anterior», y sin ella un cruce no se puede
  // distinguir de un «está por encima». Antes que resolver mal, no resolver.
  if (velas.length < 2) return { tipo: "NADA" };

  const i = velas.length - 1;
  const vela = velas[i];
  const ctx = contextoDe(estrategia, velas, sessionOf);

  if (posicion) {
    const motivo = motivoDeSalida(posicion, velas, i, estrategia, ctx);
    if (!motivo) return { tipo: "NADA" };

    return {
      tipo: "CERRAR",
      precio: aplicarDeslizamiento(
        precioDeSalida(motivo, posicion, vela),
        posicion.side === "LARGO" ? "VENTA" : "COMPRA",
        ajustes.deslizamientoPct,
      ),
      motivo,
    };
  }

  // Una posición por bot. Piramidar cambia por completo el cálculo del riesgo
  // y merece ser una decisión explícita, no el efecto secundario de que la
  // señal siga cumpliéndose tres velas seguidas.
  if (!withinHours(estrategia, vela.time)) return { tipo: "NADA" };
  if (!allHold(estrategia.entry, ctx, i)) return { tipo: "NADA" };

  // `BOTH` entra en largo, igual que en el motor de backtest. No es que dé
  // igual: es que el papel tiene que dar la misma señal que dio el backtest
  // con el que se midió la línea base. Un papel que abre cortos que el
  // backtest nunca abrió no valida nada, compara dos estrategias distintas.
  const side: LadoPapel = estrategia.direction === "SHORT" ? "CORTO" : "LARGO";
  const precio = aplicarDeslizamiento(
    vela.close,
    side === "LARGO" ? "COMPRA" : "VENTA",
    ajustes.deslizamientoPct,
  );
  const atr = ctx.series.get("ATR14")?.[i] ?? null;

  return {
    tipo: "ABRIR",
    side,
    precio,
    stop: nivel(precio, atr, estrategia.exit.stopAtr, side, "STOP"),
    objetivo: nivel(precio, atr, estrategia.exit.targetAtr, side, "OBJETIVO"),
    atr,
  };
}

/**
 * Las series que la estrategia necesita, calculadas sobre estas velas.
 *
 * Hace lo mismo que `buildContext` de `lib/backtest/rules.ts` con una sola
 * diferencia: la sesión la decide quien llama en vez de estar fijada dentro.
 * Importa para el VWAP, que es el único indicador que se reinicia por sesión,
 * y que con un corte distinto dibuja un nivel distinto.
 */
function contextoDe(
  estrategia: Strategy,
  velas: Vela[],
  sessionOf: (time: number) => string,
): EvaluationContext {
  const series = new Map<string, Serie>();

  for (const id of indicatorsUsed(estrategia)) {
    // Lo que no esté en el catálogo se queda fuera, y sus condiciones no se
    // cumplen nunca. Inventarle una serie a un identificador desconocido sería
    // hacer operar al bot con un número que nadie calculó.
    if (isIndicatorId(id)) series.set(id, computeIndicator(id, velas, sessionOf));
  }

  return { velas, series };
}

/**
 * Qué cierra la posición en esta vela, si algo la cierra.
 *
 * El orden es deliberadamente pesimista: primero el stop, después el objetivo.
 * Ver la regla 3 de `evaluarVela`.
 */
function motivoDeSalida(
  posicion: PosicionAbierta,
  velas: Vela[],
  i: number,
  estrategia: Strategy,
  ctx: EvaluationContext,
): MotivoSalida | null {
  const vela = velas[i];

  if (posicion.stop !== null) {
    const tocado =
      posicion.side === "LARGO" ? vela.low <= posicion.stop : vela.high >= posicion.stop;
    if (tocado) return "STOP";
  }

  if (posicion.objetivo !== null) {
    const tocado =
      posicion.side === "LARGO" ? vela.high >= posicion.objetivo : vela.low <= posicion.objetivo;
    if (tocado) return "OBJETIVO";
  }

  const barras = barrasEnMercado(velas, posicion.horaEntrada);
  if (estrategia.exit.maxBars !== null && barras >= estrategia.exit.maxBars) return "TIEMPO";

  if (estrategia.exit.conditions.length > 0 && anyHolds(estrategia.exit.conditions, ctx, i)) {
    return "CONDICION";
  }

  return null;
}

/**
 * A qué precio se sale, antes del deslizamiento.
 *
 * El stop y el objetivo salen en su propio nivel, dentro de la misma vela: es
 * donde estaba la orden. Salvo que la vela **abriera ya pasada** del nivel, y
 * entonces se sale a la apertura, que es peor -- la orden se habría ejecutado
 * ahí. Suponer el nivel en un hueco de apertura es regalarle a la estrategia
 * un precio que no llegó a existir, y los huecos van casi siempre en contra.
 *
 * Las salidas por tiempo o por condición salen al cierre de la vela: es la
 * decisión que se acaba de tomar y el último precio que existe.
 */
function precioDeSalida(motivo: MotivoSalida, posicion: PosicionAbierta, vela: Vela): number {
  if (motivo === "STOP" && posicion.stop !== null) {
    return posicion.side === "LARGO"
      ? Math.min(posicion.stop, vela.open)
      : Math.max(posicion.stop, vela.open);
  }
  if (motivo === "OBJETIVO" && posicion.objetivo !== null) {
    return posicion.side === "LARGO"
      ? Math.max(posicion.objetivo, vela.open)
      : Math.min(posicion.objetivo, vela.open);
  }
  return vela.close;
}

/** El nivel del stop o del objetivo, en múltiplos del ATR de la vela de entrada. */
function nivel(
  entrada: number,
  atr: number | null,
  multiplo: number | null,
  side: LadoPapel,
  cual: "STOP" | "OBJETIVO",
): number | null {
  if (multiplo === null || atr === null || atr <= 0) return null;
  const distancia = atr * multiplo;
  const arriba = cual === "OBJETIVO" ? side === "LARGO" : side === "CORTO";
  return redondear(arriba ? entrada + distancia : entrada - distancia);
}

/**
 * Cuántas velas lleva abierta la posición.
 *
 * Se cuenta desde la vela de entrada hasta la última del histórico. Si la
 * entrada quedó fuera de la ventana que se está mirando -- una posición vieja
 * y una ventana corta -- lo que sale es una cota inferior, no el número
 * exacto. Da igual para lo que se usa: esa cota ya es mayor que cualquier
 * `maxBars` razonable, así que la posición se cierra por tiempo, que es
 * justamente lo que tenía que pasar.
 */
export function barrasEnMercado(velas: Vela[], horaEntrada: number): number {
  const i = velas.findIndex((v) => v.time >= horaEntrada);
  if (i < 0) return 0;
  return velas.length - 1 - i;
}

/**
 * El deslizamiento, siempre en contra.
 *
 * Comprar sale más caro y vender más barato, se abra o se cierre. No hay
 * ninguna operación en la que el deslizamiento ayude: si alguna vez sale a
 * favor en el mercado real es ruido, y meter ese ruido en la simulación sólo
 * sirve para que el bot parezca mejor la mitad de las veces.
 *
 * En porcentaje y no en ticks, al contrario que el backtest, porque el
 * simulador opera sobre contado y una cuenta en dólares: un tick de un futuro
 * no significa nada cuando el tamaño es 0,043 BTC.
 */
export function aplicarDeslizamiento(
  precio: number,
  lado: "COMPRA" | "VENTA",
  deslizamientoPct: number,
): number {
  const factor = new Decimal(deslizamientoPct).div(100);
  const ajustado =
    lado === "COMPRA"
      ? new Decimal(precio).times(factor.plus(1))
      : new Decimal(precio).times(new Decimal(1).minus(factor));
  return redondear(ajustado.toNumber());
}

export interface ResultadoOperacion {
  /** Neto: la comisión de las dos puntas ya está descontada. */
  pnl: number;
  /** Sobre el importe de la entrada, no sobre el patrimonio de la cuenta. */
  pnlPct: number;
  /** Lo que se llevaron los costes, aparte, para poder ver cuánto pesan. */
  comision: number;
  importeEntrada: number;
  importeSalida: number;
}

/**
 * El resultado de una operación cerrada.
 *
 * La comisión se cobra en las **dos** puntas, al entrar y al salir. Cobrarla
 * sólo a la salida abarataría a la mitad a las estrategias que más operan, que
 * son precisamente las que mueren por costes, y el simulador existe entre
 * otras cosas para detectarlas.
 *
 * `pnlPct` se calcula sobre el importe de la entrada y no sobre el patrimonio
 * de la cuenta. Los dos son porcentajes legítimos y dicen cosas distintas; lo
 * que no se puede es que unas pantallas usen uno y otras el otro, que es
 * cómo se acaba enseñando dos números distintos de la misma operación.
 *
 * Con `Decimal` y no con números sueltos: el tamaño es fraccionario (0,043
 * BTC) y los precios tienen cinco cifras, y ahí el error del coma flotante
 * deja de ser teórico -- se acumula operación tras operación en el efectivo de
 * la cuenta, que es la cifra que tiene que cuadrar con la suma del histórico.
 */
export function resultadoDeOperacion(entrada: {
  side: LadoPapel;
  size: number;
  precioEntrada: number;
  precioSalida: number;
  comisionPct: number;
}): ResultadoOperacion {
  const size = new Decimal(entrada.size);
  const importeEntrada = size.times(entrada.precioEntrada);
  const importeSalida = size.times(entrada.precioSalida);

  const bruto =
    entrada.side === "LARGO"
      ? importeSalida.minus(importeEntrada)
      : importeEntrada.minus(importeSalida);

  const comision = importeEntrada
    .plus(importeSalida)
    .times(new Decimal(entrada.comisionPct).div(100));

  const pnl = bruto.minus(comision);

  return {
    pnl: redondear(pnl.toNumber()),
    // Sobre una entrada de importe cero no hay porcentaje que dar; es una
    // división por cero disfrazada, y un `Infinity` en la base de datos
    // contamina cualquier media que se calcule después.
    pnlPct: importeEntrada.isZero()
      ? 0
      : redondear(pnl.div(importeEntrada).times(100).toNumber(), 4),
    comision: redondear(comision.toNumber()),
    importeEntrada: redondear(importeEntrada.toNumber()),
    importeSalida: redondear(importeSalida.toNumber()),
  };
}

/**
 * Cuánto efectivo devolvería cerrar la posición ahora mismo.
 *
 * Es el importe que se reservó al abrir más el resultado neto de cerrar a este
 * precio, y sirve para las dos cosas que hay que calcular: el patrimonio
 * mientras la posición sigue abierta y el efectivo cuando se cierra de verdad.
 * Una sola fórmula para las dos, porque en cuanto son dos, la curva de
 * patrimonio y el histórico de operaciones dejan de cuadrar entre sí y ya no
 * se sabe cuál de las dos miente.
 *
 * En un corto se reserva el mismo importe que en un largo. No es que se
 * «compre» nada: es la garantía, y reservarla mantiene el significado de
 * `efectivo` -- dinero no comprometido -- e impide que un corto simulado abra
 * una posición más grande de lo que la cuenta aguanta.
 */
export function valorDeCierre(
  posicion: PosicionAbierta,
  precio: number,
  comisionPct: number,
): number {
  const resultado = resultadoDeOperacion({
    side: posicion.side,
    size: posicion.size,
    precioEntrada: posicion.precioEntrada,
    precioSalida: precio,
    comisionPct,
  });
  return redondear(resultado.importeEntrada + resultado.pnl);
}

/**
 * El tamaño que se puede comprar con este capital a este precio.
 *
 * Se trunca a ocho decimales en vez de redondearse, y no es una manía: con el
 * redondeo hacia arriba, el importe de la posición supera al efectivo por una
 * milésima y la escritura choca contra `paper_accounts_efectivo_no_negativo`.
 * Un céntimo mal redondeado tumbando el ciclo de un bot es un fallo caro de
 * encontrar.
 */
export function tamanoPorCapital(capital: number, precio: number): number {
  if (!(capital > 0) || !(precio > 0)) return 0;
  return new Decimal(capital).div(precio).toDecimalPlaces(8, Decimal.ROUND_DOWN).toNumber();
}

/**
 * Ocho decimales por defecto, que es la precisión de una fracción de bitcoin.
 *
 * Existe para que lo que se guarda sea el número que se calculó y no su
 * sombra binaria: sin esto, un precio con deslizamiento sale como
 * 100.02000000000001 y esa cola aparece luego en pantalla.
 */
function redondear(valor: number, decimales = 8): number {
  return new Decimal(valor).toDecimalPlaces(decimales).toNumber();
}
