import { Decimal } from "decimal.js";
import { Receipt } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatDuration, formatMoney, formatSignedMoney, pnlColorClass } from "@/lib/format";
import type { LadoPapel, MotivoSalida } from "@/lib/paper/engine";

/**
 * Todas las operaciones que ha simulado un bot, una por fila.
 *
 * Es la parte aburrida y la que decide si el resto vale algo. Una curva de
 * capital que sube no dice si subió por una operación afortunada o por
 * cuarenta pequeñas, ni si las que perdieron salieron por el stop o por
 * aburrimiento; eso sólo se ve fila a fila. Por eso cada una trae las dos
 * horas, los dos precios, el motivo por el que salió y cuántas velas estuvo
 * dentro: con eso se puede ir al gráfico y mirar esa operación concreta.
 *
 * Dos decisiones sobre los datos que entran:
 *
 *   1. **Los números llegan como texto.** Los `numeric` de Postgres viajan como
 *      cadena para no perder decimales por el camino, así que el tipo los
 *      acepta tal cual y aquí se convierten una sola vez, al formatear. Pedir
 *      `number` obligaría a que cada pantalla hiciera su propio `Number(...)`,
 *      y el redondeo acabaría siendo distinto en cada una.
 *
 *   2. **El lado y el motivo se traducen, no se confían.** Los dos llegan como
 *      texto de la base -- es lo que da Supabase -- y sus `check` sólo dejan
 *      dos y seis valores, que están todos aquí con su frase. Pero si algún
 *      día apareciera uno nuevo, la tabla enseña el código en crudo en vez de
 *      quedarse en blanco o de llamarlo por el nombre de otro. Una fila sin
 *      motivo se lee como un fallo de la operación; una con un código raro se
 *      lee como lo que es, algo que todavía no sabemos nombrar.
 */

export interface OperacionDePapel {
  id: string;
  /** «LARGO» o «CORTO», tal y como lo guarda `paper_trades`. */
  side: string;
  size: string | number;
  precioEntrada: string | number;
  horaEntrada: string;
  precioSalida: string | number;
  horaSalida: string;
  /** Neto: la comisión de las dos puntas ya está descontada. */
  pnl: string | number;
  /** Sobre el importe de la entrada, no sobre el capital de la cuenta. */
  pnlPct: string | number;
  comision: string | number;
  motivoSalida: string;
  barrasEnMercado: number | null;
}

/**
 * El motivo, dicho como se lo contarías a alguien.
 *
 * El `Record` tipado obliga a que cualquier motivo nuevo del motor pase por
 * aquí antes de compilar; el `Map` es lo que permite buscar por una cadena
 * cualquiera sin castear el tipo a la fuerza.
 */
const MOTIVOS: Record<MotivoSalida, string> = {
  STOP: "Saltó el stop",
  OBJETIVO: "Llegó al objetivo",
  TIEMPO: "Se agotó el tiempo",
  CONDICION: "Se cumplió su condición de salida",
  MANUAL: "Cerrada a mano",
  APAGADO: "Se apagó el bot",
};

const MOTIVOS_POR_CODIGO = new Map<string, string>(Object.entries(MOTIVOS));

function motivoEnPalabras(motivo: string): string {
  return MOTIVOS_POR_CODIGO.get(motivo) ?? motivo;
}

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

/** «1 vela» y no «1 velas»: en un bot de un minuto pasa a todas horas. */
function velas(cuantas: number): string {
  return `${cuantas} vela${cuantas === 1 ? "" : "s"}`;
}

/** Cuánto estuvo dentro de verdad, en tiempo de reloj. */
function tiempoDentro(entrada: string, salida: string): string {
  const desde = Date.parse(entrada);
  const hasta = Date.parse(salida);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta < desde) return "--";
  return formatDuration((hasta - desde) / 1000);
}

export function PaperTradesTabla({
  operaciones,
  timezone = "UTC",
  moneda = "USD",
}: {
  operaciones: OperacionDePapel[];
  timezone?: string;
  moneda?: string;
}) {
  if (operaciones.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Todavía no ha cerrado ninguna operación"
        description="En cuanto el simulador abra y cierre una posición aparecerá aquí, con la hora y el precio de las dos puntas. Si el bot lleva días encendido y esto sigue vacío, es que sus condiciones no se han dado: no es un fallo, es la estrategia esperando."
      />
    );
  }

  // Ordenadas por la salida y de la más reciente a la más antigua, aunque
  // quien las pase ya las traiga ordenadas: lo primero que se mira de una
  // lista de operaciones es la última, y que eso dependa de la consulta de
  // cada pantalla es cómo dos pantallas acaban enseñando lo mismo al revés.
  const filas = [...operaciones].sort((a, b) => b.horaSalida.localeCompare(a.horaSalida));

  const neto = filas.reduce((suma, op) => suma.plus(new Decimal(op.pnl)), new Decimal(0));
  const comisiones = filas.reduce((suma, op) => suma.plus(new Decimal(op.comision)), new Decimal(0));
  const ganadoras = filas.filter((op) => new Decimal(op.pnl).gt(0)).length;
  const acierto = (ganadoras / filas.length) * 100;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2 md:hidden">
        {filas.map((op) => (
          <li key={op.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant={colorDelLado(op.side)}>{ladoEnPalabras(op.side)}</Badge>
              <span className={`text-sm font-semibold tabular-nums ${pnlColorClass(op.pnl)}`}>
                {formatSignedMoney(op.pnl, { currency: moneda })}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Entró</dt>
                <dd className="text-foreground">{formatDateTime(op.horaEntrada, timezone)}</dd>
                <dd className="tabular-nums text-muted-foreground">
                  {formatMoney(op.precioEntrada, { currency: moneda })}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Salió</dt>
                <dd className="text-foreground">{formatDateTime(op.horaSalida, timezone)}</dd>
                <dd className="tabular-nums text-muted-foreground">
                  {formatMoney(op.precioSalida, { currency: moneda })}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {motivoEnPalabras(op.motivoSalida)} ·{" "}
              {op.barrasEnMercado === null ? "velas sin contar" : `${velas(op.barrasEnMercado)} dentro`} ·{" "}
              {tiempoDentro(op.horaEntrada, op.horaSalida)}
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left font-medium">Lado</th>
              <th className="py-2 pr-3 text-left font-medium">Entró</th>
              <th className="py-2 pr-3 text-right font-medium">Precio</th>
              <th className="py-2 pr-3 text-left font-medium">Salió</th>
              <th className="py-2 pr-3 text-right font-medium">Precio</th>
              <th className="py-2 pr-3 text-left font-medium">Por qué salió</th>
              <th className="py-2 pr-3 text-right font-medium">Dentro</th>
              <th className="py-2 text-right font-medium">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((op) => (
              <tr key={op.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="py-2 pr-3">
                  <Badge variant={colorDelLado(op.side)}>{ladoEnPalabras(op.side)}</Badge>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                  {formatDateTime(op.horaEntrada, timezone)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                  {formatMoney(op.precioEntrada, { currency: moneda })}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                  {formatDateTime(op.horaSalida, timezone)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                  {formatMoney(op.precioSalida, { currency: moneda })}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{motivoEnPalabras(op.motivoSalida)}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap text-muted-foreground">
                  {op.barrasEnMercado === null ? "--" : velas(op.barrasEnMercado)}
                  <div className="text-xs">{tiempoDentro(op.horaEntrada, op.horaSalida)}</div>
                </td>
                <td className={`py-2 text-right tabular-nums ${pnlColorClass(op.pnl)}`}>
                  {formatSignedMoney(op.pnl, { currency: moneda })}
                  <div className="text-xs">
                    {`${new Decimal(op.pnlPct).gte(0) ? "+" : ""}${new Decimal(op.pnlPct).toFixed(2)}%`}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{filas.length}</span> operaciones cerradas ·{" "}
          <span className="font-medium text-foreground">{ganadoras}</span> ganadoras (
          {acierto.toFixed(0)}%) · neto{" "}
          <span className={`font-medium tabular-nums ${pnlColorClass(neto.toString())}`}>
            {formatSignedMoney(neto.toString(), { currency: moneda })}
          </span>{" "}
          después de pagar {formatMoney(comisiones.toString(), { currency: moneda })} de comisiones.
        </p>
        <p>
          El P&amp;L de cada fila ya lleva descontada la comisión de las dos puntas, y su porcentaje
          está calculado sobre el dinero que puso en esa operación, no sobre la cuenta entera: una
          operación del +3% no mueve la cuenta un 3% si sólo entró con la mitad del capital.
        </p>
      </div>
    </div>
  );
}
