import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { ContentStatus } from "@/modules/content/domain/content";

export interface PieceRow {
  id: string;
  title: string;
  platforms: string[];
  status: ContentStatus;
  planned_date: string | null;
  published_at: string | null;
  url: string | null;
  notes: string | null;
}

export async function fetchPieces(): Promise<PieceRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("content_pieces")
    .select("id, title, platforms, status, planned_date, published_at, url, notes")
    .eq("user_id", user.id)
    // Sin fecha al final: lo que tiene fecha es lo que corre prisa.
    .order("planned_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return data ?? [];
}
