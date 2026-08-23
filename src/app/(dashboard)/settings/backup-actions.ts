"use server";

import { requireUser } from "@/lib/auth/require-user";
import {
  compareToLive,
  ESSENTIAL_TABLES,
  inspectBackup,
  IRREPLACEABLE_TABLES,
  type BackupReport,
  type DriftRow,
} from "@/lib/backup/shape";
import { recordAudit } from "@/lib/audit/log";
import { createClient } from "@/lib/supabase/server";

export interface BackupCheckResult {
  error: string | null;
  path: string | null;
  report: BackupReport | null;
  drift: { rows: DriftRow[]; stale: boolean; message: string } | null;
}

/**
 * Abre la última copia automática y comprueba que serviría.
 *
 * Había copias desde hace tiempo y nadie había abierto una nunca. Una copia que
 * no se ha restaurado jamás no es una copia: es un rumor, y el día que hace
 * falta ya no hay margen para descubrir que estaba truncada.
 *
 * No restaura nada -- se puede pulsar cualquier día sin miedo. Lee el fichero,
 * dice qué tiene, y lo compara con lo que hay ahora mismo en la base de datos,
 * que es lo que distingue una copia buena de una buena hace tres meses.
 */
export async function checkLatestBackup(): Promise<BackupCheckResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: files, error: listError } = await supabase.storage
    .from("backups")
    .list(user.id, { limit: 100, sortBy: { column: "name", order: "desc" } });

  if (listError) {
    return {
      error: `No se pudo leer la carpeta de copias: ${listError.message}`,
      path: null,
      report: null,
      drift: null,
    };
  }

  const latest = (files ?? []).filter((f) => f.name.endsWith(".json"))[0];
  if (!latest) {
    return {
      error:
        "Todavía no hay ninguna copia automática guardada. Se hace sola una vez al día; hasta la primera, descarga una a mano con el botón de arriba.",
      path: null,
      report: null,
      drift: null,
    };
  }

  const path = `${user.id}/${latest.name}`;
  const { data: blob, error: downloadError } = await supabase.storage.from("backups").download(path);

  if (downloadError || !blob) {
    return {
      error: `La copia existe pero no se pudo abrir: ${downloadError?.message ?? "descarga vacía"}. Eso ya es el fallo que esta comprobación busca.`,
      path,
      report: null,
      drift: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await blob.text());
  } catch {
    return {
      error:
        "La copia está guardada pero no es JSON válido: se truncó al escribirse. Descarga una a mano ahora mismo y revisa el registro de la copia automática.",
      path,
      report: null,
      drift: null,
    };
  }

  const report = inspectBackup(parsed);
  const drift = compareToLive(report, await countLiveRows());

  await recordAudit({
    userId: user.id,
    action: "BACKUP_VERIFIED",
    entityType: "backup",
    entityId: path,
    metadata: { ok: report.ok, rows: report.totalRows, stale: drift.stale },
  });

  return { error: null, path, report, drift };
}

/** Cuántas filas hay ahora, para poder decir qué se perdería al restaurar. */
async function countLiveRows(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const counts: Record<string, number> = {};

  // `products` no lleva user_id -- son especificaciones de contrato, no datos
  // personales -- así que RLS no la filtra y el conteo es el global. Es el
  // mismo criterio con el que se guarda en la copia.
  for (const table of [...ESSENTIAL_TABLES, ...IRREPLACEABLE_TABLES]) {
    const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
    counts[table] = count ?? 0;
  }

  return counts;
}
