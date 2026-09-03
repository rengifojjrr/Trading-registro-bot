import {
  MINIMO_DIAS_PARA_VAR,
  NIVEL_CVAR,
  NIVEL_VAR,
  type LecturaDeRiesgoDiario,
  type RepartoPorBloques,
} from "@/lib/bots/riesgo-portfolio";
import { BLOCK_HINTS, BLOCK_LABELS } from "@/lib/bots/types";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Cuánto se puede perder mañana: VaR al 95% y CVaR al 99%.
 *
 * El VaR es la pérdida que sólo se supera un día de cada veinte; el CVaR, lo
 * que se pierde de media cuando toca uno de esos días. Van juntos porque por
 * separado engañan: el VaR dice dónde está la puerta y el CVaR lo que hay
 * detrás. Con menos de treinta días de muestra la tarjeta lo dice en alto,
 * porque una cifra con dos decimales calculada sobre cinco días se lee como
 * una medida sin serlo.
 */
export function TarjetaDeVaR({
  riesgo,
  currency,
}: {
  riesgo: LecturaDeRiesgoDiario | null;
  currency: string;
}) {
  if (riesgo === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay ningún día con operaciones cerradas. El VaR se calcula sobre el P&amp;L diario del equipo, así
        que hace falta que el equipo opere primero.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {riesgo.muestraCorta ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          Sólo {riesgo.dias} día{riesgo.dias === 1 ? "" : "s"} de muestra y hacen falta {MINIMO_DIAS_PARA_VAR}. Estas
          dos cifras son orientativas: con tan pocos días el percentil no mide nada, es el peor día de la lista con
          dos decimales. No dimensiones con ellas.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra
          label={`VaR ${NIVEL_VAR}%`}
          money={riesgo.var95}
          pct={riesgo.var95Pct}
          currency={currency}
          destacada
        />
        <Cifra label={`CVaR ${NIVEL_CVAR}%`} money={riesgo.cvar99} pct={riesgo.cvar99Pct} currency={currency} />
        <Cifra label="Peor día" money={riesgo.peorDia} pct={null} currency={currency} />
        <div className="rounded-md border border-border px-3 py-2">
          <dt className="text-xs text-muted-foreground">Días en rojo</dt>
          <dd className="text-base font-semibold tabular-nums text-foreground">
            {riesgo.diasEnPerdida} de {riesgo.dias}
          </dd>
          <dd className="text-xs tabular-nums text-muted-foreground">
            {((riesgo.diasEnPerdida / riesgo.dias) * 100).toFixed(0)}% de la muestra
          </dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        Un día de cada veinte se pierde más de {formatMoney(riesgo.var95, { currency })}; cuando toca uno de los peores
        se pierden {formatMoney(riesgo.cvar99, { currency })} de media. {riesgo.nota}
      </p>
    </div>
  );
}

/**
 * El reparto contra el 40/40/20, en números.
 *
 * Las barras enseñan la forma del portfolio; esta tabla enseña la distancia
 * exacta a la que está cada bloque de su objetivo, que es lo que se apunta en
 * la revisión mensual cuando toca rebalancear.
 */
export function TarjetaDeBloques({ reparto }: { reparto: RepartoPorBloques }) {
  if (reparto.base === "NONE") {
    return (
      <p className="text-sm text-muted-foreground">
        Sin bots en staging ni en producción. Los bloques se reparten con lo que opera con dinero de verdad.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">Bloque</th>
              <th className="py-1 text-right font-medium">Objetivo</th>
              <th className="py-1 text-right font-medium">Real</th>
              <th className="py-1 text-right font-medium">Desvío</th>
              <th className="py-1 text-right font-medium">Bots</th>
            </tr>
          </thead>
          <tbody>
            {reparto.filas.map((fila) => (
              <tr key={fila.bloque} className="border-t border-border">
                <td className="py-1.5 text-foreground" title={BLOCK_HINTS[fila.bloque]}>
                  {BLOCK_LABELS[fila.bloque]}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fila.objetivo}%</td>
                <td className="py-1.5 text-right tabular-nums text-foreground">{fila.real.toFixed(0)}%</td>
                <td
                  className={cn(
                    "py-1.5 text-right tabular-nums",
                    fila.fuera ? "font-semibold text-warning" : "text-muted-foreground",
                  )}
                >
                  {fila.desvio > 0 ? "+" : ""}
                  {fila.desvio.toFixed(0)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fila.bots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {reparto.base === "SIZING"
          ? `Medido por el tamaño asignado: ${reparto.totalSizingPct.toFixed(0)}% del capital en total.`
          : "Ningún bot tiene tamaño asignado, así que se cuenta por número de bots."}{" "}
        {reparto.desvia && reparto.peor
          ? `${BLOCK_LABELS[reparto.peor.bloque]} es el que más se ha ido, ${Math.abs(reparto.peor.desvio).toFixed(0)} puntos. Se rebalancea en la revisión mensual, no antes.`
          : "Ningún bloque se sale de la banda de diez puntos."}
      </p>
    </div>
  );
}

function Cifra({
  label,
  money,
  pct,
  currency,
  destacada = false,
}: {
  label: string;
  money: number;
  pct: number | null;
  currency: string;
  destacada?: boolean;
}) {
  return (
    <div className={cn("rounded-md border px-3 py-2", destacada ? "border-primary/60 bg-primary/5" : "border-border")}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-foreground">
        {pct === null ? formatMoney(money, { currency }) : `${pct.toFixed(2)}%`}
      </dd>
      {pct !== null ? (
        <dd className="text-xs tabular-nums text-muted-foreground">{formatMoney(money, { currency })}</dd>
      ) : null}
    </div>
  );
}
