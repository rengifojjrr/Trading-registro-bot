import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export interface SleepEntryRow {
  id: string;
  sleep_date: string;
  slept_at: string | null;
  woke_at: string | null;
  duration_minutes: number | null;
  score: number | null;
  mood_on_waking: string[];
  woke_how: string[];
  before_bed: string[];
  dream: string | null;
  notes: string | null;
  place: string | null;
}

/** Las últimas noches, la más reciente primero. */
export async function fetchSleepEntries(limit = 60): Promise<SleepEntryRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("sleep_entries")
    .select(
      "id, sleep_date, slept_at, woke_at, duration_minutes, score, mood_on_waking, woke_how, before_bed, dream, notes, place",
    )
    .eq("user_id", user.id)
    .order("sleep_date", { ascending: false })
    .limit(limit);

  // score llega como cadena desde Postgres numeric.
  return (data ?? []).map((row) => ({ ...row, score: row.score === null ? null : Number(row.score) }));
}

export async function fetchSleepEntryFor(date: string): Promise<SleepEntryRow | null> {
  const entries = await fetchSleepEntries(400);
  return entries.find((e) => e.sleep_date === date) ?? null;
}
