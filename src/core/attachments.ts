import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { EntityKind } from "@/types/database";

import type { AttachmentRow } from "./attachment-kinds";

/**
 * Ficheros colgados de una entidad.
 *
 * En el calendario de contenido hay dos propiedades de archivo -- «Videos» y
 * «Listo» -- donde viven los montajes y las versiones finales. Guardar sólo
 * una dirección de texto significaba que el fichero seguía en Drive y la app
 * no lo tenía: si el enlace caducaba, la pieza se quedaba sin nada.
 *
 * El cubo es privado. La ruta empieza por el identificador del usuario porque
 * es lo que comprueba la política de `storage.objects`, igual que en las
 * capturas de operaciones.
 */

const BUCKET = "vida-adjuntos";
const MAX_BYTES = 50 * 1024 * 1024;

// Los nombres y el formateo viven en un módulo sin servidor porque el
// componente que los pinta corre en el navegador.
export {
  ATTACHMENT_SLOTS,
  SLOT_LABELS,
  formatBytes,
  type AttachmentRow,
  type AttachmentSlot,
} from "./attachment-kinds";

export async function fetchAttachments(
  kind: EntityKind,
  entityId: string,
): Promise<AttachmentRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_attachments")
    .select("id, slot, storage_path, file_name, mime_type, size_bytes, created_at")
    .eq("user_id", user.id)
    .eq("entity_kind", kind)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Una sola llamada para todas las firmas en lugar de una por fichero.
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);

  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return rows.map((row) => ({
    id: row.id,
    slot: row.slot,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    url: urls.get(row.storage_path) ?? null,
  }));
}

export interface UploadResult {
  ok: boolean;
  error?: string;
}

export async function uploadAttachment(
  kind: EntityKind,
  entityId: string,
  slot: string,
  file: File,
): Promise<UploadResult> {
  if (file.size === 0) return { ok: false, error: "El fichero está vacío." };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "El fichero pasa de 50 MB." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  // El nombre se sanea pero se conserva: dentro de una carpeta por entidad no
  // hace falta que sea único a nivel global, y un nombre reconocible es la
  // mitad de para qué sirve la lista.
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "fichero";
  const path = `${user.id}/${kind}/${entityId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });

  if (uploadError) return { ok: false, error: "No se pudo subir el fichero." };

  const { error } = await supabase.from("core_attachments").insert({
    user_id: user.id,
    entity_kind: kind,
    entity_id: entityId,
    slot,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: file.type || null,
    size_bytes: file.size,
  });

  if (error) {
    // Sin fila, el objeto sería basura invisible que ocupa cuota para siempre.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "No se pudo registrar el fichero." };
  }

  return { ok: true };
}

export async function removeAttachment(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("core_attachments")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row) return;

  await supabase.storage.from(BUCKET).remove([row.storage_path]);
  await supabase.from("core_attachments").delete().eq("id", id).eq("user_id", user.id);
}

/** Se lleva los ficheros de una entidad que se va, del cubo y de la tabla. */
export async function removeAttachmentsFor(kind: EntityKind, entityId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_attachments")
    .select("storage_path")
    .eq("user_id", user.id)
    .eq("entity_kind", kind)
    .eq("entity_id", entityId);

  const paths = (data ?? []).map((r) => r.storage_path);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

  await supabase
    .from("core_attachments")
    .delete()
    .eq("user_id", user.id)
    .eq("entity_kind", kind)
    .eq("entity_id", entityId);
}

/** Cuántos ficheros tiene cada entidad de una lista. */
export async function countAttachments(
  kind: EntityKind,
  entityIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (entityIds.length === 0) return counts;

  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("core_attachments")
    .select("entity_id")
    .eq("user_id", user.id)
    .eq("entity_kind", kind)
    .in("entity_id", entityIds);

  for (const row of data ?? []) {
    counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
  }
  return counts;
}
