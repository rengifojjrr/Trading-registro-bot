"use client";

import { DateTime } from "luxon";
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
export function EquityCurveChart({
  points,
  timezone,
}: {
  points: EquityCurvePoint[];
  timezone: string;
}) {
  const data = points.map((p, index) => ({
    index,
    closedAt: p.closedAt,
    value: Number(p.cumulativeNetPnl),
  }));

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
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
