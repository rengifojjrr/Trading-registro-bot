"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";

import { DateTime } from "luxon";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatClockHours } from "@/core/clock";
import { shiftDate } from "@/core/today";

/**
 * Las gráficas de Vida.
 *
 * Todas comparten tres decisiones, y las tres son a propósito:
 *
 * 1. El color entra por prop como el nombre de una custom property del
 *    módulo (`--mod-sleep`), no como un hex. Así una gráfica de sueño es
 *    morada y una de lecturas ámbar sin que ninguna sepa qué color es el
 *    suyo, y el modo claro las oscurece a la vez que al resto.
 *
 * 2. Sin leyenda ni rejilla vertical -- salvo donde hay dos series y la
 *    leyenda es la única forma de saber cuál es cuál. En una serie sola la
 *    leyenda repite el título de la tarjeta, y la rejilla vertical compite
 *    con las barras sin añadir nada.
 *
 * 3. Los ejes en `--muted-foreground` y las líneas en `--border`: los
 *    mismos tokens que el resto de la interfaz, para que una gráfica no
 *    parezca pegada de otra aplicación.
 */

const AXIS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
  cursor: { fill: "var(--accent)", opacity: 0.35 },
} as const;

export interface Point {
  label: string;
  value: number;
  /**
   * El día que representa el punto, cuando representa uno.
   *
   * Es lo que hace la barra pulsable: lleva a la ficha de ese día. Se guarda
   * la fecha y no una dirección porque el que construye la serie ya la tiene
   * -- la etiqueta («12 mar») sale de ella -- y así no hay que repetir la
   * misma cadena de ruta en once sitios.
   */
  date?: string;
  /** A dónde lleva cuando no es un día. Gana sobre `date`. */
  href?: string;
}

/**
 * Navegar al pulsar un punto de una gráfica.
 *
 * Recharts entrega el estado del gráfico, no el dato: el punto vivo está en
 * `activePayload`. Devuelve un manejador para el gráfico entero en lugar de
 * uno por barra porque así vale igual para líneas, dispersión y barras, donde
 * lo que se pulsa no siempre es una forma con `onClick`.
 */
function useChartDrill() {
  const router = useRouter();

  return (state: unknown) => {
    const payload = (state as { activePayload?: { payload?: Point }[] } | null)?.activePayload;
    const point = payload?.[0]?.payload;
    const href = hrefOf(point);
    if (href) router.push(href as Route);
  };
}

function hrefOf(point: { date?: string; href?: string } | undefined): string | null {
  if (!point) return null;
  if (point.href) return point.href;
  return point.date ? `/dia/${point.date}` : null;
}

/** Si la serie lleva a algún sitio, el puntero tiene que decirlo. */
function drillCursor(data: { date?: string; href?: string }[]): "pointer" | undefined {
  return data.some((point) => hrefOf(point) !== null) ? "pointer" : undefined;
}

/**
 * El formateador del tooltip.
 *
 * Recharts entrega el valor como `ValueType | undefined` -- puede ser número,
 * texto o array -- así que la conversión ocurre aquí una sola vez en lugar de
 * repetir el mismo `as number` en cada gráfica.
 */
function withUnit(unit?: string) {
  return (value: unknown): [string, string] => [
    `${typeof value === "number" ? value : String(value ?? "")}${unit ? ` ${unit}` : ""}`,
    "",
  ];
}

/** Barras por día, con una línea opcional de referencia -- tu media. */
export function BarSeries({
  data,
  colorToken,
  height = 200,
  average,
  unit,
}: {
  data: Point[];
  colorToken: string;
  height?: number;
  /** Dibuja una línea horizontal punteada: el «esto es lo normal en ti». */
  average?: number | null;
  unit?: string;
}) {
  const drill = useChartDrill();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
        onClick={drill}
        style={{ cursor: drillCursor(data) }}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
        <YAxis {...AXIS} width={44} />
        <Tooltip {...TOOLTIP_STYLE} formatter={withUnit(unit)} />
        {average != null ? (
          <ReferenceLine
            y={average}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: "media", position: "right", fill: "var(--muted-foreground)", fontSize: 10 }}
          />
        ) : null}
        <Bar dataKey="value" fill={`var(${colorToken})`} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Línea para porcentajes y rachas, donde importa la tendencia y no el valor puntual. */
export function LineSeries({
  data,
  colorToken,
  height = 200,
  unit,
}: {
  data: Point[];
  colorToken: string;
  height?: number;
  unit?: string;
}) {
  const drill = useChartDrill();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: -18 }}
        onClick={drill}
        style={{ cursor: drillCursor(data) }}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
        <YAxis {...AXIS} width={44} />
        <Tooltip {...TOOLTIP_STYLE} formatter={withUnit(unit)} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={`var(${colorToken})`}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Varias líneas sobre el mismo eje, para comparar dos medidas que comparten
 * unidad: acostarse y levantarse, tareas creadas y terminadas.
 *
 * `format="clock"` dibuja el eje en horas del reloj, contando la madrugada
 * como 24, 25, 26 -- ver `@/core/clock`. Es una cadena y no una función
 * porque estas gráficas se dibujan desde componentes de servidor, y una
 * función no cruza esa frontera.
 */
export function MultiLineSeries({
  data,
  series,
  height = 220,
  unit,
  format,
}: {
  /**
   * Una fila por punto del eje X; cada serie lee su propia clave. Un `null`
   * deja hueco en esa línea -- que es lo correcto para un dato que falta, al
   * contrario que un cero.
   */
  data: ({ label: string } & Record<string, number | string | null>)[];
  series: { key: string; label: string; colorToken: string }[];
  height?: number;
  unit?: string;
  format?: "clock";
}) {
  const tick = format === "clock" ? (v: number) => formatClockHours(v) : undefined;
  const drill = useChartDrill();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -6 }}
        onClick={drill}
        style={{ cursor: drillCursor(data as { date?: string; href?: string }[]) }}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
        <YAxis {...AXIS} width={48} tickFormatter={tick} domain={["auto", "auto"]} />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: unknown, name: unknown) => [
            format === "clock" && typeof value === "number"
              ? formatClockHours(value)
              : `${String(value)}${unit ? ` ${unit}` : ""}`,
            String(name),
          ]}
        />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)", paddingTop: 4 }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={`var(${s.colorToken})`}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface DeltaPoint {
  label: string;
  /** Puede ser negativo: es una diferencia contra una referencia, no una cantidad. */
  value: number;
  /** Se enseña junto a la etiqueta -- «Leer · 12 noches» -- para dar peso al dato. */
  note?: string;
}

/**
 * Barras que salen de un cero central, hacia un lado o hacia el otro.
 *
 * Es la forma de una diferencia, y una diferencia no se dibuja como una
 * cantidad: con barras normales, «media hora menos» y «media hora más»
 * saldrían del mismo borde y habría que leer el número para saber cuál es
 * cuál. Aquí el lado ya lo dice, y el color lo repite para quien no distinga
 * la dirección de un vistazo.
 */
export function DeltaRanks({
  data,
  positiveToken = "--positive",
  negativeToken = "--negative",
  height = 240,
  unit,
}: {
  data: DeltaPoint[];
  positiveToken?: string;
  negativeToken?: string;
  height?: number;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey="label" {...AXIS} width={140} />
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value: unknown, _name: unknown, item: { payload?: DeltaPoint }) => [
            `${typeof value === "number" && value > 0 ? "+" : ""}${String(value)}${unit ? ` ${unit}` : ""}`,
            item?.payload?.note ?? "",
          ]}
        />
        <ReferenceLine x={0} stroke="var(--muted-foreground)" />
        <Bar dataKey="value" radius={2}>
          {data.map((entry) => (
            <Cell
              key={entry.label}
              fill={`var(${entry.value >= 0 ? positiveToken : negativeToken})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontales para comparar categorías: géneros, proyectos, ingredientes. */
export function RankSeries({
  data,
  colorToken,
  height = 220,
  unit,
}: {
  data: Point[];
  colorToken: string;
  height?: number;
  unit?: string;
}) {
  const drill = useChartDrill();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
        onClick={drill}
        style={{ cursor: drillCursor(data) }}
      >
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey="label" {...AXIS} width={130} />
        <Tooltip {...TOOLTIP_STYLE} formatter={withUnit(unit)} />
        <Bar dataKey="value" fill={`var(${colorToken})`} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dispersión para cruzar dos medidas: ¿duermo mejor cuando duermo más? */
export function ScatterPlot({
  data,
  colorToken,
  xLabel,
  yLabel,
  height = 220,
}: {
  data: { x: number; y: number; label?: string }[];
  colorToken: string;
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -18 }}>
        <CartesianGrid stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          {...AXIS}
          label={{ value: xLabel, position: "insideBottom", offset: -8, fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <YAxis type="number" dataKey="y" name={yLabel} {...AXIS} width={44} />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={{ strokeDasharray: "3 3", stroke: "var(--border)" }}
          formatter={(v: unknown, name: unknown) => [String(v), name === "x" ? xLabel : yLabel]}
        />
        <Scatter data={data} fill={`var(${colorToken})`} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export interface HeatCell {
  date: string;
  /** 0 = sin marcar. Cualquier valor mayor pinta con más intensidad. */
  value: number;
}

/**
 * Cuadrícula de días al estilo de las contribuciones de GitHub.
 *
 * Es la forma canónica de mirar un hábito porque enseña lo único que
 * importa de uno: la continuidad. Una gráfica de barras de «hecho / no
 * hecho» dice lo mismo y se lee mucho peor.
 *
 * No usa recharts -- son cuadraditos, y un SVG a mano pesa menos y se
 * controla mejor.
 */
export function HeatGrid({
  cells,
  colorToken,
  today,
  weeks = 13,
}: {
  cells: HeatCell[];
  colorToken: string;
  /**
   * El hoy del usuario, en ISO y ya resuelto en su zona horaria por el
   * servidor. No se lee el reloj aquí: `new Date()` durante el render
   * depende del reloj del navegador, y en Bogotá a las nueve de la noche
   * eso ya es mañana en UTC -- la última columna saldría corrida un día.
   */
  today: string;
  weeks?: number;
}) {
  const byDate = new Map(cells.map((c) => [c.date, c.value]));
  const max = Math.max(1, ...cells.map((c) => c.value));

  // La última columna es la semana en curso; se avanza hasta el domingo
  // para que las filas sean días de la semana de verdad y hoy caiga en su
  // sitio en lugar de al final.
  const weekday = DateTime.fromISO(today).weekday; // 1 = lunes .. 7 = domingo
  const end = shiftDate(today, 7 - weekday);

  const columns: { date: string; value: number }[][] = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const column: { date: string; value: number }[] = [];
    for (let d = 0; d < 7; d += 1) {
      const iso = shiftDate(end, -(w * 7) - (6 - d));
      column.push({ date: iso, value: byDate.get(iso) ?? 0 });
    }
    columns.push(column);
  }

  const size = 12;
  const gap = 3;

  return (
    <div className="overflow-x-auto">
      <svg
        width={columns.length * (size + gap)}
        height={7 * (size + gap)}
        role="img"
        aria-label={`Actividad de las últimas ${weeks} semanas`}
      >
        {columns.map((column, x) =>
          column.map((cell, y) => {
            // Un día que aún no ha llegado no es un día sin marcar. Pintarlo
            // igual que un fallo convertiría el resto de la semana en una
            // racha rota que todavía no existe.
            const future = cell.date > today;
            const square = (
              <rect
                x={x * (size + gap)}
                y={y * (size + gap)}
                width={size}
                height={size}
                rx={2}
                fill={cell.value > 0 ? `var(${colorToken})` : "var(--secondary)"}
                opacity={future ? 0.3 : cell.value > 0 ? 0.35 + 0.65 * (cell.value / max) : 1}
              >
                <title>
                  {`${cell.date}: ${future ? "aún no" : cell.value > 0 ? "hecho" : "sin marcar"}`}
                </title>
              </rect>
            );

            // Un día que aún no ha llegado no lleva a ninguna parte: su ficha
            // estaría vacía por definición.
            if (future) return <g key={cell.date}>{square}</g>;

            return (
              <a key={cell.date} href={`/dia/${cell.date}`} style={{ cursor: "pointer" }}>
                {square}
              </a>
            );
          }),
        )}
      </svg>
    </div>
  );
}

/**
 * Barras apiladas por categoría dentro de cada día. Para el reparto por
 * plataforma o por tipo de comida a lo largo de una semana.
 */
export function CategoryBars({
  data,
  colorTokens,
  height = 200,
}: {
  data: (Point & { category: string })[];
  /** Un token por categoría, en el mismo orden en que aparecen. */
  colorTokens: string[];
  height?: number;
}) {
  const categories = [...new Set(data.map((d) => d.category))];

  const drill = useChartDrill();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
        onClick={drill}
        style={{ cursor: drillCursor(data) }}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={44} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={`${entry.label}-${entry.category}`}
              fill={`var(${colorTokens[categories.indexOf(entry.category) % colorTokens.length]})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
