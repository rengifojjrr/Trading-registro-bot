import { Decimal } from "decimal.js";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/format";
import type { LadoPapel } from "@/lib/paper/engine";

/**
 * La posición que un bot de papel tiene abierta ahora mismo.
 *
 * La curva de capital y la tabla de operaciones cuentan lo que ya pasó; esta
 * tarjeta es lo único de la ficha que cuenta lo que está pasando. Y es lo que
 * hay que mirar cuando la curva todavía no dice nada: un bot recién encendido
 * puede llevar dos días dentro de una operación sin que la gráfica lo enseñe,
 * porque la gráfica va a un punto por vela. Sin esto, ese bot parece parado.
 *
 * Tres decisiones sobre lo que se enseña:
 *
 *   1. **El P&L latente se valora al cierre de la última vela cerrada**, que es
 *      el mismo precio con el que el ciclo valora el patrimonio. No es el
 *      precio de este instante -- el simulador no tiene ticker -- y no se
 *      disimula: si no hay precio se dice que no lo hay, en vez de enseñar un
 *      cero que se leería como «ni gana ni pierde».
 *
 *   2. **«Sin stop» se escribe.** Un stop en blanco se lee como un dato que
 *      falta; un stop que no existe es una decisión de la estrategia (o un
 *      descuido suyo), y en los dos casos hay que verlo escrito para poder
 *      juzgarlo.
 *
 *   3. **Las distancias al stop y al objetivo se miden desde el último
 *      cierre**, no desde la entrada. Lo que importa de un stop cuando la
 *      posición ya está abierta es cuánto margen queda, y eso cambia con cada
 *      vela.
 *
 * Los números llegan como texto -- son `numeric` de Postgres -- y se pasan a
 * `Decimal` una sola vez, igual que en la curva de capital, para que las dos
 * pantallas no redondeen cada una a su manera.
 */

export interface PosicionAbiertaEnPantalla {
  /** «LARGO» o «CORTO», tal y como lo guarda `paper_positions`. */
  side: string;
  size: string | number;
  precioEntrada: string | number;
  horaEntrada: string;
  stop: string | number | null;
  objetivo: string | number | null;
  atrEntrada: string | number | null;
}

/**
 * El lado se traduce, no se confía: el `check` de la tabla sólo deja dos
 * valores, pero si un día llegara otro se enseña en crudo y en gris en lugar
 * de quedarse en blanco o de llamarlo por el nombre del vecino.
 */
const LADOS: Record<LadoPapel, string> = { LARGO: "Largo", CORTO: "Corto" };

const LADOS_POR_CODIGO = new Map<string, string>(Object.entries(LADOS));

function ladoEnPalabras(side: string): string {
  return LADOS_POR_CODIGO.get(side) ?? side;
}

/** Verde el que gana subiendo, rojo el que gana bajando; gris lo que no sabemos leer. */
function colorDelLado(side: string): "positive" | "negative" | "outline" {
  if (side === "LARGO") return "positive";
  if (side === "CORTO") return "negative";
  return "outline";
}

/**
 * Hacia dónde gana: +1 si con el precio subiendo, -1 si bajando. `null` para
 * un lado desconocido, porque un P&L calculado con el signo adivinado es peor
 * que ninguno.
 */
function sentidoDelLado(side: string): 1 | -1 | null {
  if (side === "LARGO") return 1;
  if (side === "CORTO") return -1;
  return null;
}

/** A cuánto está un nivel del precio de referencia, en % con signo. */
function distanciaDesde(nivel: string | number | null, referencia: Decimal | null): Decimal | null {
  if (nivel === null || referencia === null || referencia.isZero()) return null;
  return new Decimal(nivel).minus(referencia).div(referencia).times(100);
}

/** «a 2,15% por debajo del último cierre», que se lee mejor que «-2,15%». */
function distanciaEnPalabras(distancia: Decimal): string {
  if (distancia.isZero()) return "justo en el último cierre";
  const lado = distancia.lt(0) ? "por debajo" : "por encima";
  return `a ${distancia.abs().toFixed(2)}% ${lado} del último cierre`;
}

export function PosicionAbiertaCard({
  posicion,
  precioActual,
  moneda = "USD",
  timezone = "UTC",
}: {
  posicion: PosicionAbiertaEnPantalla | null;
  /** El cierre de la última vela cerrada; `null` si todavía no hay velas. */
  precioActual: number | null;
  moneda?: string;
  timezone?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Posición abierta</CardTitle>
        <CardDescription>
          Lo que el bot tiene en el mercado ahora mismo, valorado al cierre de la última vela.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {posicion === null ? (
          <p className="text-sm text-muted-foreground">
            Sin posición abierta. El bot está esperando a que se cumplan sus condiciones de entrada.
          </p>
        ) : (
          <Detalle posicion={posicion} precioActual={precioActual} moneda={moneda} timezone={timezone} />
        )}
      </CardContent>
    </Card>
  );
}

function Detalle({
  posicion,
  precioActual,
  moneda,
  timezone,
}: {
  posicion: PosicionAbiertaEnPantalla;
  precioActual: number | null;
  moneda: string;
  timezone: string;
}) {
  const size = new Decimal(posicion.size);
  const entrada = new Decimal(posicion.precioEntrada);
  const ultimoCierre = precioActual === null ? null : new Decimal(precioActual);
  const sentido = sentidoDelLado(posicion.side);

  // Lo que puso en la operación. Es la base del porcentaje del P&L latente,
  // la misma que usa `paper_trades.pnl_pct`, para que una operación no cambie
  // de porcentaje al pasar de esta tarjeta a la tabla cuando se cierre.
  const importe = size.times(entrada);

  const latente =
    ultimoCierre !== null && sentido !== null
      ? ultimoCierre.minus(entrada).times(size).times(sentido)
      : null;
  const latentePct = latente !== null && !importe.isZero() ? latente.div(importe).times(100) : null;

  const distanciaStop = distanciaDesde(posicion.stop, ultimoCierre);
  const distanciaObjetivo = distanciaDesde(posicion.objetivo, ultimoCierre);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={colorDelLado(posicion.side)}>{ladoEnPalabras(posicion.side)}</Badge>
          <span className="text-sm tabular-nums text-foreground">
            {formatNumber(size.toString(), 6)} a {formatMoney(entrada.toString(), { currency: moneda })}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            ({formatMoney(importe.toString(), { currency: moneda })} en juego)
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Desde {formatDateTime(posicion.horaEntrada, timezone)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato
          label="P&L latente"
          valor={latente === null ? "--" : formatSignedMoney(latente.toString(), { currency: moneda })}
          tono={latente === null ? "text-foreground" : pnlColorClass(latente.toString())}
          nota={
            latente === null
              ? sentido === null
                ? `lado «${posicion.side}» desconocido: no se sabe hacia dónde gana`
                : "sin precio con el que valorarla todavía"
              : `${formatPercent(latentePct === null ? null : latentePct.toNumber())} sobre lo que puso`
          }
        />
        <Dato
          label="Último cierre"
          valor={ultimoCierre === null ? "--" : formatMoney(ultimoCierre.toString(), { currency: moneda })}
          nota={
            ultimoCierre === null
              ? "no hay ninguna vela cerrada aún"
              : `${formatPercent(entrada.isZero() ? null : ultimoCierre.minus(entrada).div(entrada).times(100).toNumber())} desde la entrada`
          }
        />
        <Dato
          label="Stop"
          valor={posicion.stop === null ? "Sin stop" : formatMoney(posicion.stop, { currency: moneda })}
          tono={posicion.stop === null ? "text-warning" : "text-foreground"}
          nota={
            posicion.stop === null
              ? "no hay un precio que la cierre en pérdidas por sí solo"
              : distanciaStop === null
                ? "distancia sin calcular hasta tener un cierre"
                : distanciaEnPalabras(distanciaStop)
          }
        />
        <Dato
          label="Objetivo"
          valor={posicion.objetivo === null ? "Sin objetivo" : formatMoney(posicion.objetivo, { currency: moneda })}
          nota={
            posicion.objetivo === null
              ? "no hay un precio que la cierre en ganancias por sí solo"
              : distanciaObjetivo === null
                ? "distancia sin calcular hasta tener un cierre"
                : distanciaEnPalabras(distanciaObjetivo)
          }
        />
      </dl>

      <p className="text-xs text-muted-foreground">
        {ultimoCierre === null
          ? "El P&L latente se calcula con el cierre de la última vela cerrada y todavía no hay ninguna: aparecerá en cuanto el ciclo evalúe una."
          : "Valorada al cierre de la última vela cerrada, que es el mismo precio con el que el ciclo calcula el patrimonio; no es el precio de este instante."}
        {posicion.atrEntrada === null
          ? ""
          : ` El ATR al entrar era ${formatMoney(posicion.atrEntrada, { currency: moneda })}; con él se colocaron el stop y el objetivo.`}
      </p>
    </div>
  );
}

function Dato({
  label,
  valor,
  nota,
  tono = "text-foreground",
}: {
  label: string;
  valor: string;
  /** Una línea debajo de la cifra que dice desde dónde se mide o por qué falta. Nunca vacía. */
  nota: string;
  /** La clase de color de la cifra: el P&L va en verde o rojo, el «sin stop» en ámbar. */
  tono?: string;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums ${tono}`}>{valor}</dd>
      <dd className="text-xs tabular-nums text-muted-foreground">{nota}</dd>
    </div>
  );
}
