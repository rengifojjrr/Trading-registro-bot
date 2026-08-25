import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { fetchJournalInbox } from "@/lib/journal/inbox";
import { createClient } from "@/lib/supabase/server";
import { readSyncStatus } from "@/lib/sync/read-status";

/**
 * Todo lo que está esperando a que hagas algo, en una sola lista.
 *
 * La aplicación tiene cuarenta y cuatro pantallas y lo pendiente estaba
 * repartido por todas: los avisos en Actividad, las operaciones sin apuntar en
 * el Diario, las discrepancias en Conciliación, la sincronización en el Panel.
 * Cada sitio contestaba su parte y ninguno contestaba «¿qué me falta?», que es
 * la única pregunta que se hace al abrir la aplicación.
 *
 * Dos reglas para que esto no se convierta en otra bandeja que se ignora:
 *
 * 1. **Solo lo accionable.** Nada que sea informativo. Si no hay un botón que
 *    lo resuelva, no sale.
 * 2. **Nunca revienta.** Cada fuente va por su lado y un fallo suyo se traga:
 *    la lista de lo pendiente no puede ser lo que tumbe la portada.
 */
export type PendingSeverity = "CRITICO" | "AVISO" | "INFO";

export interface PendingItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  severity: PendingSeverity;
  /** Para ordenar: cuanto más alto, más arriba. */
  weight: number;
}

export async function gatherPending(): Promise<PendingItem[]> {
  const [sync, journal, discrepancies, notifications] = await Promise.all([
    safe(() => readSyncStatusSafe(), null),
    safe(() => fetchJournalInbox(), { groups: [], total: 0, days: 0 }),
    safe(() => countOpenDiscrepancies(), 0),
    safe(() => countUnreadCritical(), { critical: 0, warning: 0 }),
  ]);

  const items: PendingItem[] = [];

  // Lo primero: si las cifras no se pueden creer, lo demás sobra.
  if (sync && sync.severity === "alarm") {
    items.push({
      id: "sync",
      title: "La sincronización no está al día",
      detail:
        sync.fillGaps > 0
          ? `Faltan ${sync.fillGaps} ejecuciones por traer. Hasta que se traigan, las cifras están incompletas.`
          : "La última sincronización falló. Las cifras pueden estar incompletas.",
      href: "/activity",
      actionLabel: "Ver y reparar",
      severity: "CRITICO",
      weight: 100,
    });
  }

  if (discrepancies > 0) {
    items.push({
      id: "discrepancies",
      title: `${discrepancies} diferencia${discrepancies === 1 ? "" : "s"} con Coinbase sin resolver`,
      detail:
        "La aplicación y Coinbase no cuentan lo mismo. Cada una hay que mirarla y decidir cuál de las dos tiene razón.",
      href: "/reconciliation",
      actionLabel: "Revisar",
      severity: "CRITICO",
      weight: 90,
    });
  }

  if (notifications.critical > 0) {
    items.push({
      id: "critical-notifications",
      title: `${notifications.critical} aviso${notifications.critical === 1 ? "" : "s"} sin leer`,
      detail: "Cosas que la aplicación marcó como graves y nadie ha mirado todavía.",
      href: "/activity",
      actionLabel: "Ver avisos",
      severity: "CRITICO",
      weight: 80,
    });
  }

  if (journal.total > 0) {
    items.push({
      id: "journal",
      title: `${journal.total} operaci${journal.total === 1 ? "ón" : "ones"} sin apuntar`,
      detail:
        journal.days > 1
          ? `De ${journal.days} días distintos. Lo que pensabas al entrar se olvida antes de lo que parece.`
          : "Lo que pensabas al entrar se olvida antes de lo que parece.",
      href: "/journal",
      actionLabel: "Apuntar",
      severity: "AVISO",
      weight: 60,
    });
  }

  if (notifications.warning > 0) {
    items.push({
      id: "warning-notifications",
      title: `${notifications.warning} advertencia${notifications.warning === 1 ? "" : "s"} sin leer`,
      detail: "Ni graves ni urgentes, pero conviene mirarlas antes de que se acumulen.",
      href: "/activity",
      actionLabel: "Ver",
      severity: "AVISO",
      weight: 40,
    });
  }

  return items.sort((a, b) => b.weight - a.weight);
}

async function readSyncStatusSafe() {
  const user = await requireUser();
  return readSyncStatus(user.id);
}

async function countOpenDiscrepancies(): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("reconciliation_discrepancies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("resolved_at", null);

  return count ?? 0;
}

async function countUnreadCritical(): Promise<{ critical: number; warning: number }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("severity")
    .eq("user_id", user.id)
    .eq("is_read", false)
    .is("resolved_at", null)
    .limit(200);

  return {
    critical: (data ?? []).filter((n) => n.severity === "CRITICAL").length,
    warning: (data ?? []).filter((n) => n.severity === "WARNING").length,
  };
}

/**
 * Una fuente que falla no puede tumbar la lista entera.
 *
 * Es la portada: si la consulta de discrepancias se cae, lo correcto es
 * enseñar lo demás y no una pantalla de error donde debería estar el resumen
 * del día.
 */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("[pendiente] una fuente falló", error);
    return fallback;
  }
}
