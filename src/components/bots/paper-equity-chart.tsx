import { Decimal } from "decimal.js";

import { EquityCurveChart } from "@/components/dashboard/equity-curve-chart";
import { ChartFrame } from "@/core/ui/chart-frame";
import {
  ETIQUETA_GRANULARIDAD,
  SEGUNDOS_POR_GRANULARIDAD,
  esGranularidadPublica,
  type GranularidadPublica,
} from "@/lib/coinbase/public-candles";
import { formatMoney, formatPercent, pnlColorClass } from "@/lib/format";

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
}) {
  const capital = new Decimal(capitalAsignado);
  const enOrden = [...puntos].sort((a, b) => a.ts.localeCompare(b.ts));

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

        <EquityCurveChart points={serie} timezone={timezone} />
      </div>
    </ChartFrame>
  );
}
