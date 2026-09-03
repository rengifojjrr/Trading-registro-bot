import { Decimal } from "decimal.js";

import { EquityCurveChart } from "@/components/dashboard/equity-curve-chart";
import { ChartFrame } from "@/core/ui/chart-frame";
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
 * Con menos de dos puntos no se dibuja nada. Un punto suelto no es una curva:
 * es un rectángulo con ejes, y un rectángulo con ejes parece una gráfica rota
 * en lugar de una cuenta que acaba de empezar.
 */

export interface PuntoDeCapital {
  /** Cuándo se anotó: la hora de apertura de la vela que se evaluó. */
  ts: string;
  /** El valor de la cuenta en ese momento. `numeric` de Postgres, o sea texto. */
  equity: string | number;
}

export function PaperEquityChart({
  puntos,
  capitalAsignado,
  timezone = "UTC",
  moneda = "USD",
}: {
  puntos: PuntoDeCapital[];
  /** Con lo que arrancó la cuenta. Es la línea del cero de la gráfica. */
  capitalAsignado: string | number;
  timezone?: string;
  moneda?: string;
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
      empty={serie.length < 2}
      emptyLabel="Todavía no hay curva que dibujar. El simulador escribe un punto cada vez que evalúa una vela de este bot, así que la primera línea aparece en cuanto pase un par de ciclos con la cuenta encendida."
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
