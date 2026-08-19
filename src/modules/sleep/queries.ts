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
  /** Tu estimación, que no es la resta de las dos horas. */
  self_reported: string | null;
  icon: string | null;
}

const SLEEP_COLUMNS =
  "id, sleep_date, slept_at, woke_at, duration_minutes, score, mood_on_waking, woke_how, before_bed, dream, notes, place, self_reported, icon";

/** Las últimas noches, la más reciente primero. */
export async function fetchSleepEntries(limit = 60): Promise<SleepEntryRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("sleep_entries")
    .select(SLEEP_COLUMNS)
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

/** Una noche por su identificador, para su ficha. */
export async function fetchSleepEntry(id: string): Promise<SleepEntryRow | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("sleep_entries")
    .select(SLEEP_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  return { ...data, score: data.score === null ? null : Number(data.score) };
}
