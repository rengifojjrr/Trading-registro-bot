import "server-only";

import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { EMPTY_RESULT, readNotionDatabase, type ImportResult } from "@/lib/notion/read-database";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { resolveSleepTimestamps } from "./domain/sleep";
import { mapNotionNight } from "./domain/notion-mapping";

/**
 * Trae las noches de la base «Dormir» de Notion.
 *
 * Lo que esta importación consigue, y que allí no existía, es la duración:
 * dos etiquetas de texto («2am», «10am») se vuelven dos instantes, y Postgres
 * calcula los minutos entre ellos. Esa es la cifra que el módulo entero
 * necesita y la que ninguna vista de Notion podía dar.
 */

export function sleepDatabaseId(): string | null {
  return serverEnv().NOTION_SLEEP_DATABASE_ID ?? null;
}

export async function importSleepFromNotion(): Promise<ImportResult> {
  const env = serverEnv();
  if (!env.NOTION_API_TOKEN) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_API_TOKEN en el servidor." };
  }
  if (!env.NOTION_SLEEP_DATABASE_ID) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_SLEEP_DATABASE_ID en el servidor." };
  }

  const user = await requireUser();
  const timezone = await userTimezone();
  const supabase = await createClient();

  const read = await readNotionDatabase(env.NOTION_SLEEP_DATABASE_ID);
  if (!read.ok) return { ...EMPTY_RESULT, error: read.error };

  const warnings = new Set<string>();
  const rows: Database["public"]["Tables"]["sleep_entries"]["Insert"][] = [];
  let skipped = 0;
  let withoutClocks = 0;

  for (const page of read.pages) {
    const mapped = mapNotionNight(page);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    for (const warning of mapped.warnings) warnings.add(warning);

    const night = mapped.night;
    const { sleptAt, wokeAt } = resolveSleepTimestamps({
      sleepDate: night.sleep_date,
      bedtime: night.bedtime,
      wakeTime: night.wake_time,
      timezone,
    });
    if (sleptAt === null || wokeAt === null) withoutClocks += 1;

    rows.push({
      user_id: user.id,
      notion_page_id: night.notion_page_id,
      sleep_date: night.sleep_date,
      slept_at: sleptAt,
      woke_at: wokeAt,
      score: night.score,
      before_bed: night.before_bed,
      woke_how: night.woke_how,
      mood_on_waking: night.mood_on_waking,
      dream: night.dream,
      notes: night.notes,
      place: night.place,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return { ...EMPTY_RESULT, skipped, warnings: [...warnings] };
  }

  const { data: existing } = await supabase
    .from("sleep_entries")
    .select("notion_page_id")
    .eq("user_id", user.id)
    .not("notion_page_id", "is", null);
  const known = new Set((existing ?? []).map((row) => row.notion_page_id));

  // Se resuelve por `notion_page_id` y no por `sleep_date` a propósito: hay
  // noches sueltas registradas a mano en la aplicación, y machacarlas con lo
  // de Notion borraría lo que sólo existe aquí.
  const { error } = await supabase
    .from("sleep_entries")
    .upsert(rows, { onConflict: "user_id,notion_page_id" });
  if (error) {
    return { ...EMPTY_RESULT, error: "No se pudieron guardar las noches importadas." };
  }

  const updated = rows.filter((row) => row.notion_page_id !== null && row.notion_page_id !== undefined && known.has(row.notion_page_id)).length;
  const notes: string[] = [];
  if (withoutClocks > 0) {
    notes.push(
      `${withoutClocks} ${withoutClocks === 1 ? "noche llegó" : "noches llegaron"} sin las dos horas, así que no tienen duración.`,
    );
  }

  return {
    imported: rows.length - updated,
    updated,
    skipped,
    warnings: [...warnings],
    notes,
    error: null,
  };
}
