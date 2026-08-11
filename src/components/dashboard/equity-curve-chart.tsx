"use client";

import { DateTime } from "luxon";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { EquityCurvePoint } from "@/lib/analytics/stats";
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

  const finalValue = data[data.length - 1]?.value ?? 0;
  const strokeColor = finalValue >= 0 ? "var(--positive)" : "var(--negative)";

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
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
        <Area type="monotone" dataKey="value" stroke={strokeColor} strokeWidth={2} fill="url(#equityGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function formatAxisDate(iso: string | undefined, timezone: string): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone);
  return dt.isValid ? dt.toFormat("dd LLL") : "";
}
