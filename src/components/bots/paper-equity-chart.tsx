"use client";

import { Decimal } from "decimal.js";
import { useMemo, useState } from "react";

import {
  EquityCurveChart,
  type MarcaEnLaCurva,
} from "@/components/dashboard/equity-curve-chart";
import type { OperacionDePapel } from "@/components/bots/paper-trades-tabla";
import { ChartFrame } from "@/core/ui/chart-frame";
import {
  ETIQUETA_GRANULARIDAD,
  SEGUNDOS_POR_GRANULARIDAD,
  esGranularidadPublica,
  type GranularidadPublica,
} from "@/lib/coinbase/public-candles";
import {
  formatDateTime,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/format";

/**
 * La curva de capital de un bot de papel.
 *
 * Es un envoltorio y no una gráfica nueva, a propósito: dibuja con la misma
 * `EquityCurveChart` que el resumen de la cuenta real. Que las dos curvas se
 * lean igual -- el corte de color en el cero, el relleno que se aleja de él --
 * es justo lo que permite comparar de un vistazo un bot simulado con lo que
 * uno hace con dinero, que es para lo que existe el simulador.
 *
 * Lo único que hace falta traducir es el eje: `paper_equity_points` guarda el
 * **valor de la cuenta** (empieza en el capital asignado y sube o baja), y
 * aquella gráfica pinta **P&L acumulado** desde cero. Así que aquí cada punto
 * se convierte restándole el capital de partida. No es un apaño para
 * encajarla: es que la línea del cero pase a significar «ni gana ni pierde», y
 * eso es lo que hay que ver. Con el valor absoluto, una cuenta de diez mil
 * dólares que ha ganado ciento veinte dibuja una recta plana muy arriba, y no
 * se distingue de una que no ha hecho nada.
 *
 * Con menos de tres puntos no se dibuja nada, y en su lugar se explica por
 * qué. Un punto suelto es un rectángulo con ejes; dos puntos son una raya
 * recta; y las dos cosas se leen como «el simulador no funciona» cuando lo que
 * pasa es que el simulador anota un punto por vela cerrada, y un bot diario
 * lleva un día por punto. Tres es el primer número con el que una línea tiene
 * forma. Antes de eso, lo honesto es decir cuántas velas faltan y cuánto
 * tiempo es eso en esta temporalidad, que es la pregunta que se está haciendo
 * quien mira una gráfica vacía.
 */

export interface PuntoDeCapital {
  /** Cuándo se anotó: la hora de apertura de la vela que se evaluó. */
  ts: string;
  /** El valor de la cuenta en ese momento. `numeric` de Postgres, o sea texto. */
  equity: string | number;
}

/** Con menos puntos no hay curva: uno es un rectángulo, dos son una raya. */
const MINIMO_PUNTOS_PARA_CURVA = 3;

/**
 * La granularidad del bot, si es una de las seis que sirve la API pública.
 *
 * `bots.timeframe` es texto libre y aquí sólo se normaliza lo obvio (espacios
 * y mayúsculas): la tabla de alias completa vive en el ciclo, que es
 * `server-only`, y duplicarla aquí es cómo dos sitios acaban traduciendo «1D»
 * de forma distinta. Lo que no se reconoce se enseña en crudo, sin estimar el
 * tiempo, en vez de inventarlo.
 */
function granularidadConocida(temporalidad: string | undefined): GranularidadPublica | null {
  if (!temporalidad) return null;
  const limpio = temporalidad.trim().toLowerCase().replace(/\s+/g, "");
  return esGranularidadPublica(limpio) ? limpio : null;
}

/** «unos 3 días», «unas 2 horas», «unos 15 minutos»: el reloj de pared, no el de velas. */
function tiempoEnPalabras(segundos: number): string {
  if (segundos >= 86400 && segundos % 86400 === 0) {
    const dias = segundos / 86400;
    return `unos ${dias} día${dias === 1 ? "" : "s"}`;
  }
  if (segundos >= 3600 && segundos % 3600 === 0) {
    const horas = segundos / 3600;
    return `unas ${horas} hora${horas === 1 ? "" : "s"}`;
  }
  const minutos = Math.max(1, Math.round(segundos / 60));
  return `unos ${minutos} minuto${minutos === 1 ? "" : "s"}`;
}

/**
 * Por qué todavía no hay curva, con las cifras de este bot.
 *
 * Dice tres cosas y en este orden: la mecánica (un punto por vela cerrada),
 * qué significa para este bot (cuántas velas faltan y cuánto tiempo es eso) y
 * cuántos lleva ya. Lo último es lo que distingue «acaba de empezar» de
 * «lleva un día y va bien»: con un punto anotado la cuenta ya está viva,
 * aunque la gráfica no lo enseñe.
 */
function porQueNoHayCurva(anotados: number, temporalidad: string | undefined): string {
  const faltan = MINIMO_PUNTOS_PARA_CURVA - anotados;
  const velasQueFaltan = `${faltan} vela${faltan === 1 ? "" : "s"}${anotados > 0 ? " más" : ""}`;
  const lleva =
    anotados === 0
      ? "Todavía no ha anotado ninguno."
      : anotados === 1
        ? "Lleva 1 anotado."
        : `Lleva ${anotados} anotados.`;

  const granularidad = granularidadConocida(temporalidad);
  if (granularidad === null) {
    const velas = temporalidad ? `velas de ${temporalidad.trim()}` : "su temporalidad";
    return `El simulador anota un punto por cada vela cerrada que evalúa. Este bot opera en ${velas}, así que tarda ${velasQueFaltan} en dibujar una curva. ${lleva}`;
  }

  const espera = tiempoEnPalabras(SEGUNDOS_POR_GRANULARIDAD[granularidad] * faltan);
  return `El simulador anota un punto por cada vela cerrada que evalúa. Este bot opera en velas de ${ETIQUETA_GRANULARIDAD[granularidad]}, así que tarda ${velasQueFaltan} en dibujar una curva: ${espera} con la cuenta encendida. ${lleva}`;
}

export function PaperEquityChart({
  puntos,
  capitalAsignado,
  timezone = "UTC",
  moneda = "USD",
  temporalidad,
  operaciones = [],
}: {
  puntos: PuntoDeCapital[];
  /** Con lo que arrancó la cuenta. Es la línea del cero de la gráfica. */
  capitalAsignado: string | number;
  timezone?: string;
  moneda?: string;
  /**
   * `bots.timeframe`, p. ej. «1d». Sólo se usa para explicar, cuando aún no
   * hay curva, cuánto va a tardar en haberla. Sin ella la explicación es
   * genérica, no peor.
   */
  temporalidad?: string;
  /**
   * Las operaciones cerradas, para poder marcarlas sobre la curva.
   *
   * Sin ellas la gráfica sigue funcionando: se dibuja sin marcas, que es como
   * estaba. Es lo que hace que la pantalla del resumen general pueda seguir
   * usándola sin traerse ciento treinta filas que allí no se van a tocar.
   */
  operaciones?: OperacionDePapel[];
}) {
  const capital = new Decimal(capitalAsignado);
  // Memorizado porque de él sale el índice de cada marca: una copia nueva en
  // cada render recalcularía las ciento treinta posiciones sin que nada cambie.
  const enOrden = useMemo(() => [...puntos].sort((a, b) => a.ts.localeCompare(b.ts)), [puntos]);

  const serie = enOrden.map((punto) => ({
    closedAt: punto.ts,
    cumulativeNetPnl: new Decimal(punto.equity).minus(capital).toString(),
  }));

  const valores = enOrden.map((punto) => new Decimal(punto.equity));
  const ahora = valores.length > 0 ? valores[valores.length - 1] : capital;
  const maximo = valores.reduce((alto, valor) => (valor.gt(alto) ? valor : alto), capital);
  const ganado = ahora.minus(capital);

  // Sobre el máximo alcanzado y no sobre el capital inicial: eso es lo que
  // duele de verdad y lo que se compara con la caída máxima del backtest.
  const caida = maximo.isZero() ? new Decimal(0) : maximo.minus(ahora).div(maximo).times(100);

  const [elegida, setElegida] = useState<string | null>(null);

  /**
   * Dónde cae cada operación sobre la curva.
   *
   * Por hora de salida, que es el punto en el que la cuenta se movió: la
   * entrada no cambia el patrimonio --el dinero pasa de efectivo a posición--
   * y marcar ahí pondría el punto donde no pasó nada.
   *
   * Se busca el primer punto de curva en esa hora o después. Casi siempre es
   * exacto, porque la operación se cierra evaluando una vela y esa vela deja
   * su punto; el «o después» cubre el hueco de una vela que no llegó.
   */
  const marcas = useMemo<MarcaEnLaCurva[]>(() => {
    if (operaciones.length === 0) return [];

    const horas = enOrden.map((p) => Date.parse(p.ts));

    return operaciones.flatMap((op) => {
      const salida = Date.parse(op.horaSalida);
      if (!Number.isFinite(salida)) return [];
      const index = horas.findIndex((h) => h >= salida);
      if (index === -1) return [];
      return [{ index, id: op.id, gano: new Decimal(op.pnl).gt(0) }];
    });
  }, [operaciones, enOrden]);

  const operacion = operaciones.find((op) => op.id === elegida) ?? null;

  return (
    <ChartFrame
      title="Cómo va la cuenta"
      question="Lo que valdría la cuenta de papel en cada vela que el simulador ha evaluado."
      hint="El simulador anota un punto por vela evaluada, así que un bot diario deja un punto al día y uno de cinco minutos deja doce por hora. La línea del cero es el capital con el que se abrió la cuenta: por encima gana, por debajo pierde. El valor incluye la posición abierta, si la hay, valorada al último cierre."
      empty={serie.length < MINIMO_PUNTOS_PARA_CURVA}
      emptyLabel={porQueNoHayCurva(serie.length, temporalidad)}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Vale ahora</dt>
            <dd className="text-base font-semibold tabular-nums text-foreground">
              {formatMoney(ahora.toString(), { currency: moneda })}
            </dd>
            <dd className={`text-xs tabular-nums ${pnlColorClass(ganado.toString())}`}>
              {formatPercent(capital.isZero() ? 0 : ganado.div(capital).times(100).toNumber())} desde
              que se abrió
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Su mejor momento</dt>
            <dd className="text-base font-semibold tabular-nums text-foreground">
              {formatMoney(maximo.toString(), { currency: moneda })}
            </dd>
            <dd className="text-xs text-muted-foreground">lo más alto que ha estado</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Desde ese máximo</dt>
            <dd
              className={`text-base font-semibold tabular-nums ${
                caida.gt(0) ? "text-negative" : "text-foreground"
              }`}
            >
              -{caida.toFixed(2)}%
            </dd>
            <dd className="text-xs text-muted-foreground">lo que lleva devuelto</dd>
          </div>
        </dl>

        <EquityCurveChart
          points={serie}
          timezone={timezone}
          marcas={marcas}
          onMarca={(id) => setElegida((actual) => (actual === id ? null : id))}
          seleccionada={elegida}
        />

        {marcas.length > 0 && operacion === null ? (
          <p className="text-xs text-muted-foreground">
            Cada punto de la curva es una operación cerrada. Toca uno para ver por dónde entró y
            por dónde salió.
          </p>
        ) : null}

        {operacion ? (
          <DetalleDeLaOperacion
            operacion={operacion}
            timezone={timezone}
            moneda={moneda}
            onCerrar={() => setElegida(null)}
          />
        ) : null}
      </div>
    </ChartFrame>
  );
}

/**
 * La operación que se acaba de tocar en la curva.
 *
 * Contesta lo que uno se pregunta mirando un escalón: por dónde entró, por
 * dónde salió, cuánto estuvo dentro y por qué salió. Las dos puntas juntas y
 * con el recorrido en medio, porque el recorrido es lo que explica el escalón
 * -- y, cuando el recorrido fue a favor y el resultado no, lo que explica que
 * la comisión se lo comiera.
 */
export function DetalleDeLaOperacion({
  operacion,
  timezone,
  moneda,
  onCerrar,
}: {
  operacion: OperacionDePapel;
  timezone: string;
  moneda: string;
  onCerrar: () => void;
}) {
  const entrada = new Decimal(operacion.precioEntrada);
  const salida = new Decimal(operacion.precioSalida);
  const recorrido = operacion.side === "LARGO" ? salida.minus(entrada) : entrada.minus(salida);
  const bruto = new Decimal(operacion.pnl).plus(new Decimal(operacion.comision));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {operacion.side === "LARGO" ? "Largo" : "Corto"} · {MOTIVO[operacion.motivoSalida] ?? operacion.motivoSalida}
        </span>
        <span className={`text-sm font-semibold tabular-nums ${pnlColorClass(operacion.pnl)}`}>
          {formatSignedMoney(operacion.pnl, { currency: moneda })}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Entró</dt>
          <dd className="text-foreground">{formatDateTime(operacion.horaEntrada, timezone)}</dd>
          <dd className="tabular-nums text-muted-foreground">
            {formatMoney(operacion.precioEntrada, { currency: moneda })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Salió</dt>
          <dd className="text-foreground">{formatDateTime(operacion.horaSalida, timezone)}</dd>
          <dd className="tabular-nums text-muted-foreground">
            {formatMoney(operacion.precioSalida, { currency: moneda })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Recorrido</dt>
          <dd className={`tabular-nums ${pnlColorClass(recorrido.toString())}`}>
            {recorrido.gte(0) ? "+" : ""}
            {recorrido.toFixed(2)}
          </dd>
          <dd className="text-muted-foreground">a favor si es positivo</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Comisión</dt>
          <dd className="tabular-nums text-foreground">
            {formatMoney(operacion.comision, { currency: moneda })}
          </dd>
          <dd className="tabular-nums text-muted-foreground">
            de {formatSignedMoney(bruto.toString(), { currency: moneda })} brutos
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onCerrar}
        className="w-fit rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-accent/50 hover:text-foreground"
      >
        Quitar
      </button>
    </div>
  );
}

/** Los motivos, dichos como en la tabla: es la misma operación en dos sitios. */
const MOTIVO: Record<string, string> = {
  STOP: "saltó el stop",
  OBJETIVO: "llegó al objetivo",
  TIEMPO: "se agotó el tiempo",
  CONDICION: "se cumplió su condición de salida",
  MANUAL: "cerrada a mano",
  APAGADO: "se apagó el bot",
};
