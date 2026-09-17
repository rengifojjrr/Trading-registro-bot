"use client";

import { DateTime } from "@/lib/fecha";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EquityCurvePoint } from "@/lib/analytics/stats";
import { zeroOffset } from "@/lib/analytics/zero-offset";
import { formatMoney, formatSignedMoney } from "@/lib/format";

/**
 * X axis is the trade sequence number, not raw calendar time -- trades
 * don't happen at regular intervals (gaps on weekends, quiet weeks), so a
 * time-scaled axis would visually compress/stretch in a way that has
 * nothing to do with performance. Plotting by trade number (with the actual
 * date available on hover) is how TradeZella and most journals do this.
 */
/**
 * Un punto de la curva que además es algo: el cierre de una operación.
 *
 * La curva sola contesta «cómo va» y no contesta «por qué ahí»: un escalón
 * hacia abajo es una operación concreta, con su entrada, su salida y su motivo,
 * y hasta ahora había que ir a buscarla a la tabla comparando horas. Marcarlas
 * en la curva y poder tocarlas es lo que une las dos pantallas.
 */
export interface MarcaEnLaCurva {
  /** El índice del punto de la curva sobre el que cae. */
  index: number;
  /** Lo que quien llama quiera recibir al tocarla. */
  id: string;
  /** Verde o rojo, según le fuera. */
  gano: boolean;
}

export function EquityCurveChart({
  points,
  timezone,
  marcas = [],
  onMarca,
  seleccionada,
}: {
  points: EquityCurvePoint[];
  timezone: string;
  /** Los puntos que además son el cierre de una operación. */
  marcas?: MarcaEnLaCurva[];
  /** Qué hacer al tocar uno. Sin esto las marcas se pintan pero no se pulsan. */
  onMarca?: (id: string) => void;
  /** La que está abierta ahora mismo, para pintarla distinta. */
  seleccionada?: string | null;
}) {
  const data = points.map((p, index) => ({
    index,
    closedAt: p.closedAt,
    value: Number(p.cumulativeNetPnl),
  }));

  const porIndice = new Map(marcas.map((m) => [m.index, m]));

  /**
   * Dónde cae el cero, para partir el color ahí.
   *
   * El color salía del valor **final**, así que una curva que pasó tres meses
   * en positivo y acabó en negativo se pintaba roja entera -- y el tramo
   * bueno, que es justo lo que hay que mirar para saber qué se hizo bien, se
   * leía como parte de la caída.
   */
  const offset = zeroOffset(data.map((d) => d.value));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        // Recharts entrega el índice del punto más cercano al clic, que es
        // justo lo que hace falta: pedirle al usuario que acierte en un círculo
        // de cuatro píxeles sería no tener la función.
        onClick={(estado) => {
          if (!onMarca) return;
          const i = estado?.activeTooltipIndex;
          if (typeof i !== "number") return;
          const marca = porIndice.get(i) ?? marcaMasCercana(porIndice, i);
          if (marca) onMarca(marca.id);
        }}
        style={onMarca && marcas.length > 0 ? { cursor: "pointer" } : undefined}
      >
        <defs>
          {/* Dos paradas en el mismo punto: es lo que hace el corte seco en el
              cero en vez de una transición de verde a rojo pasando por marrón,
              que sugeriría que hay algo intermedio entre ganar y perder. */}
          <linearGradient id="equityStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset={offset} stopColor="var(--positive)" />
            <stop offset={offset} stopColor="var(--negative)" />
          </linearGradient>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            {/* El relleno se desvanece hacia el cero por los dos lados: así lo
                que llama la atención es cuánto se alejó la curva, que es lo
                que significa. */}
            <stop offset={0} stopColor="var(--positive)" stopOpacity={0.3} />
            <stop offset={offset} stopColor="var(--positive)" stopOpacity={0.02} />
            <stop offset={offset} stopColor="var(--negative)" stopOpacity={0.02} />
            <stop offset={1} stopColor="var(--negative)" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        {/* La línea del cero, marcada: sin ella el punto donde cambia el color
            es una coincidencia visual y no un umbral. */}
        <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="index"
          tickFormatter={(i: number) => formatAxisDate(data[i]?.closedAt, timezone)}
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={48}
        />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatMoney(v, { compact: true })}
          width={72}
        />
        <Tooltip
          formatter={(value) => [formatSignedMoney(Number(value)), "P&L acumulado"]}
          labelFormatter={(index) => formatAxisDate(data[Number(index)]?.closedAt, timezone)}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--muted-foreground)", marginBottom: 2 }}
          itemStyle={{ color: "var(--foreground)" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="url(#equityStroke)"
          strokeWidth={2}
          fill="url(#equityFill)"
          // Desde el cero y no desde el borde de abajo: el relleno de una
          // curva de P&L significa «cuánto se aleja de estar en tablas», y
          // medido desde el fondo del gráfico no significa nada.
          baseValue={0}
          dot={(props) => <PuntoDeOperacion {...props} marcas={porIndice} seleccionada={seleccionada} />}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function formatAxisDate(iso: string | undefined, timezone: string): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone);
  return dt.isValid ? dt.toFormat("dd LLL") : "";
}

/**
 * La marca más cercana a donde se pulsó.
 *
 * Con cuatro mil puntos de curva y ciento treinta operaciones, exigir que el
 * clic caiga en el punto exacto es exigir puntería de un píxel. Se acepta
 * dentro de una ventana estrecha -- si no hay ninguna cerca, el clic no era
 * para una operación y no pasa nada.
 */
const RADIO_DE_CLIC = 6;

function marcaMasCercana(
  marcas: Map<number, MarcaEnLaCurva>,
  indice: number,
): MarcaEnLaCurva | null {
  for (let salto = 1; salto <= RADIO_DE_CLIC; salto += 1) {
    const antes = marcas.get(indice - salto);
    if (antes) return antes;
    const despues = marcas.get(indice + salto);
    if (despues) return despues;
  }
  return null;
}

/**
 * El punto de una operación sobre la curva.
 *
 * Sólo se dibuja donde hay operación: un punto en cada una de las cuatro mil
 * velas convertiría la línea en una salchicha. El color dice cómo acabó, que
 * es lo que deja ver de un vistazo si los escalones hacia abajo son unos
 * pocos grandes o muchos pequeños.
 */
function PuntoDeOperacion({
  cx,
  cy,
  index,
  marcas,
  seleccionada,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  marcas: Map<number, MarcaEnLaCurva>;
  seleccionada?: string | null;
}) {
  const marca = typeof index === "number" ? marcas.get(index) : undefined;
  if (!marca || cx === undefined || cy === undefined) return null;

  const activa = marca.id === seleccionada;
  const color = marca.gano ? "var(--positive)" : "var(--negative)";

  return (
    <circle
      cx={cx}
      cy={cy}
      r={activa ? 5 : 2.5}
      fill={color}
      stroke={activa ? "var(--background)" : "none"}
      strokeWidth={activa ? 2 : 0}
    />
  );
}
