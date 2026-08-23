import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { findExpired, RETENTION_DAYS } from "./trash-retention";

/**
 * Cumple los treinta días que la papelera venía prometiendo.
 *
 * La página decía «se guardará 30 días» desde el primer día y no había nada que
 * borrara nunca. El fallo que importa no es el sitio que ocupa: es que
 * «borrar» dejaba de significar borrar. Quien vaciaba una entrada del diario
 * porque no quería que siguiera por ahí la estaba dejando entera,
 * indefinidamente, con sus comentarios dentro.
 *
 * Corre en la conciliación nocturna en vez de en su propio cron porque Vercel
 * en plan Hobby permite dos crones al día y ya están los dos usados. Purgar es
 * barato y no depende de nada de lo que hace la conciliación, así que va
 * detrás y un fallo suyo no arrastra al resto.
 */
export async function purgeExpiredTrash(userId: string): Promise<number> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("core_trash")
    .select("id, deleted_at")
    .eq("user_id", userId)
    // Un margen generoso: se leen las candidatas y decide `findExpired`, que
    // es lo que está cubierto por tests.
    .lt("deleted_at", new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString());

  if (!rows || rows.length === 0) return 0;

  const expired = findExpired(rows.map((r) => ({ id: r.id, deletedAt: r.deleted_at })));
  if (expired.length === 0) return 0;

  const { error } = await supabase
    .from("core_trash")
    .delete()
    .eq("user_id", userId)
    .in("id", expired);

  if (error) {
    console.error("[papelera] no se pudo purgar", error.message);
    return 0;
  }

  return expired.length;
}
