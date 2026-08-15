import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

import type { AuditAction } from "./actions";

/**
 * The record of every deliberate change a person made.
 *
 * This app presents itself as the authoritative, reconstructable history of
 * a trading account. That claim only holds if the places where a human
 * overrides the computation -- excluding a fill, declaring a contract
 * multiplier, forcing a recalculation, marking a trade as verified -- leave
 * a trail. The `audit_log` table existed from the first migration and was
 * never written to; this is what fills it.
 *
 * Deliberately never throws. An audit write failing must not roll back the
 * user's actual action: losing the note is bad, losing the correction the
 * trader just made is worse. Failures go to the server log, which is where
 * a missing trail would be investigated from anyway.
 */
export interface AuditEntry {
  userId: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  /**
   * Whatever makes the entry meaningful six months later. Keep it small and
   * factual -- before/after values, counts, the reason the user typed. Never
   * secrets, and never a whole row dump.
   */
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("audit_log").insert({
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: (entry.metadata ?? {}) as unknown as Json,
    });
    if (error) console.error("[audit] no se pudo registrar", entry.action, error.message);
  } catch (error) {
    console.error("[audit] no se pudo registrar", entry.action, error);
  }
}

export { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, type AuditAction } from "./actions";
