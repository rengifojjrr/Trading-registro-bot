import { z } from "zod";

// Shared between the API routes (app/api/trades/[tradeId]/drawings/*) and
// nothing else client-side needs zod itself for -- trade-chart.tsx imports
// only the plain TypeScript types below.
export const DRAWING_TOOLS = ["HLINE", "VLINE", "TRENDLINE", "RECTANGLE", "FIB"] as const;
export type DrawingTool = (typeof DRAWING_TOOLS)[number];

export function isDrawingTool(value: string): value is DrawingTool {
  return (DRAWING_TOOLS as readonly string[]).includes(value);
}

const drawingPointSchema = z.object({ time: z.number().int().nonnegative(), price: z.number().finite() });
const hlinePointsSchema = z.object({ price: z.number().finite() });
const vlinePointsSchema = z.object({ time: z.number().int().nonnegative() });
const twoPointPointsSchema = z.object({ p1: drawingPointSchema, p2: drawingPointSchema });

export type DrawingPoints =
  | z.infer<typeof hlinePointsSchema>
  | z.infer<typeof vlinePointsSchema>
  | z.infer<typeof twoPointPointsSchema>;

/**
 * A drawing's payload shape is decided by its tool, so the schema is picked
 * per tool rather than unioned -- a union would happily accept a VLINE
 * carrying HLINE's payload and only fail later, at render time.
 */
export function parseDrawingPoints(tool: string, points: unknown): DrawingPoints | null {
  const schema =
    tool === "HLINE" ? hlinePointsSchema : tool === "VLINE" ? vlinePointsSchema : twoPointPointsSchema;
  const parsed = schema.safeParse(points);
  return parsed.success ? parsed.data : null;
}

/**
 * Fibonacci retracement levels, drawn from the p1 (0%) anchor to p2 (100%).
 * Stored nowhere -- see the migration note: keeping this in code means an
 * existing drawing picks up any change here instead of being frozen with
 * whichever levels were fashionable when it was saved.
 */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
