import { z } from "zod";

// Shared between the API routes (app/api/trades/[tradeId]/drawings/*) and
// nothing else client-side needs zod itself for -- trade-chart.tsx imports
// only the plain TypeScript types below.
export const DRAWING_TOOLS = ["HLINE", "TRENDLINE", "RECTANGLE"] as const;
export type DrawingTool = (typeof DRAWING_TOOLS)[number];

export function isDrawingTool(value: string): value is DrawingTool {
  return (DRAWING_TOOLS as readonly string[]).includes(value);
}

const drawingPointSchema = z.object({ time: z.number().int().nonnegative(), price: z.number().finite() });
const hlinePointsSchema = z.object({ price: z.number().finite() });
const twoPointPointsSchema = z.object({ p1: drawingPointSchema, p2: drawingPointSchema });

export type DrawingPoints = z.infer<typeof hlinePointsSchema> | z.infer<typeof twoPointPointsSchema>;

export function parseDrawingPoints(tool: string, points: unknown): DrawingPoints | null {
  const schema = tool === "HLINE" ? hlinePointsSchema : twoPointPointsSchema;
  const parsed = schema.safeParse(points);
  return parsed.success ? parsed.data : null;
}
