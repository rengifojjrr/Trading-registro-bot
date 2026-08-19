import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ModuleId } from "@/core/registry";

/**
 * The contract between modules and the rest of Vida.
 *
 * A module publishes a handful of numbers per day and reads nothing from
 * anyone. The home screen and the correlations view read only this table,
 * never a module's own tables -- so a module can be removed, rewritten or
 * given away and the only visible consequence is one fewer card.
 *
 * Numbers only, on purpose. The moment this carries text or JSON it becomes
 * a second place where domain data lives, and then removing a module starts
 * breaking things again.
 */

export interface DailyMetric {
  module: ModuleId;
  key: string;
  value: number;
  unit?: string | null;
}

/**
 * Writes a day's metrics for one module, replacing whatever was there.
 *
 * Idempotent by (día, módulo, clave): re-running after an edit corrects the
 * figure instead of adding a second one. Never throws -- a module failing to
 * publish must not take down the save the user actually asked for.
 */
export async function publishDailyMetrics(
  metricDate: string,
  metrics: DailyMetric[],
): Promise<void> {
  if (metrics.length === 0) return;

  try {
    const user = await requireUser();
    const supabase = await createClient();

    await supabase.from("core_daily_metrics").upsert(
      metrics.map((m) => ({
        user_id: user.id,
        metric_date: metricDate,
        module: m.module,
        metric_key: m.key,
        value: m.value,
        unit: m.unit ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,metric_date,module,metric_key" },
    );
  } catch (error) {
    console.error("[core/metrics] no se pudieron publicar las métricas", error);
  }
}

/** Removes a module's metrics for a day -- used when the last entry of the day is deleted. */
export async function clearDailyMetrics(metricDate: string, module: ModuleId): Promise<void> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    await supabase
      .from("core_daily_metrics")
      .delete()
      .eq("user_id", user.id)
      .eq("metric_date", metricDate)
      .eq("module", module);
  } catch (error) {
    console.error("[core/metrics] no se pudieron borrar las métricas", error);
  }
}

export type MetricsByModule = Partial<Record<ModuleId, Record<string, number>>>;

/** Everything published for one day, grouped by module, for the home screen. */
export async function readDayMetrics(metricDate: string): Promise<MetricsByModule> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_daily_metrics")
    .select("module, metric_key, value")
    .eq("user_id", user.id)
    .eq("metric_date", metricDate);

  const grouped: MetricsByModule = {};
  for (const row of data ?? []) {
    // `module` a secas es una variable reservada de CommonJS y Next lo
    // rechaza, así que el id va con otro nombre.
    const moduleId = row.module as ModuleId;
    grouped[moduleId] ??= {};
    // Postgres numeric arrives as a string often enough to be worth forcing.
    grouped[moduleId]![row.metric_key] = Number(row.value);
  }
  return grouped;
}

export interface MetricPoint {
  date: string;
  value: number;
}

/** One metric over a range of days, for the correlations view. */
export async function readMetricSeries(
  module: ModuleId,
  key: string,
  fromDate: string,
  toDate: string,
): Promise<MetricPoint[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_daily_metrics")
    .select("metric_date, value")
    .eq("user_id", user.id)
    .eq("module", module)
    .eq("metric_key", key)
    .gte("metric_date", fromDate)
    .lte("metric_date", toDate)
    .order("metric_date", { ascending: true });

  return (data ?? []).map((row) => ({ date: row.metric_date, value: Number(row.value) }));
}

/**
 * Igual que publishDailyMetrics, pero para trabajos que corren sin sesión.
 *
 * La sincronización y la reconciliación se ejecutan desde un cron, donde no
 * hay usuario del que deducir el id, así que se pasa explícito y se usa el
 * cliente de servicio. Separado en dos funciones a propósito: la versión con
 * sesión es la que deben usar los módulos, y tenerla aparte evita que un
 * formulario acabe escribiendo con permisos de administrador por descuido.
 */
export async function publishDailyMetricsFor(
  userId: string,
  metricDate: string,
  metrics: DailyMetric[],
): Promise<void> {
  if (metrics.length === 0) return;

  try {
    const supabase = createAdminClient();
    await supabase.from("core_daily_metrics").upsert(
      metrics.map((m) => ({
        user_id: userId,
        metric_date: metricDate,
        module: m.module,
        metric_key: m.key,
        value: m.value,
        unit: m.unit ?? null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,metric_date,module,metric_key" },
    );
  } catch (error) {
    console.error("[core/metrics] no se pudieron publicar las métricas del trabajo", error);
  }
}
