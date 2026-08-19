import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { ContentStatus } from "@/modules/content/domain/content";

export interface PieceRow {
  id: string;
  title: string;
  summary: string | null;
  channels: string[];
  platforms: string[];
  content_type: string | null;
  status: ContentStatus;
  planned_date: string | null;
  published_at: string | null;
  has_script: boolean;
  is_edited: boolean;
  has_thumbnail_ab: boolean;
  record_difficulty: string | null;
  record_minutes: number | null;
  edit_minutes: number | null;
  edit_time_uncapped: boolean;
  edit_styles: string[];
  edit_notes: string | null;
  video_url: string | null;
  final_url: string | null;
  url: string | null;
  notes: string | null;
  notion_page_id: string | null;
}

/**
 * La lista de columnas, escrita entera en cada consulta.
 *
 * No se extrae a una constante porque PostgREST deduce el tipo de la fila a
 * partir del texto literal del `select`: una cadena construida con `+` le
 * deja de decir nada y todas las filas se vuelven `GenericStringError`.
 */

export async function fetchPieces(): Promise<PieceRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("content_pieces")
    .select(
      "id, title, summary, channels, platforms, content_type, status, planned_date, published_at, has_script, is_edited, has_thumbnail_ab, record_difficulty, record_minutes, edit_minutes, edit_time_uncapped, edit_styles, edit_notes, video_url, final_url, url, notes, notion_page_id",
    )
    .eq("user_id", user.id)
    // Sin fecha al final: lo que tiene fecha es lo que corre prisa.
    .order("planned_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function fetchPiece(id: string): Promise<PieceRow | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("content_pieces")
    .select(
      "id, title, summary, channels, platforms, content_type, status, planned_date, published_at, has_script, is_edited, has_thumbnail_ab, record_difficulty, record_minutes, edit_minutes, edit_time_uncapped, edit_styles, edit_notes, video_url, final_url, url, notes, notion_page_id",
    )
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  return data ?? null;
}
