import { readFile, rm } from "node:fs/promises";

import { E2E_READY, STATE_FILE, USES_EXTERNAL_USER } from "./support/env";
import { deleteTestUser } from "./support/supabase-admin";

/**
 * Removes the throwaway account. Runs even when tests failed, so a red run
 * never leaves data behind in a real project.
 */
export default async function globalTeardown() {
  // Never delete an account the suite didn't create.
  if (!E2E_READY || USES_EXTERNAL_USER) return;

  try {
    const { userId } = JSON.parse(await readFile(STATE_FILE, "utf8")) as { userId: string };
    await deleteTestUser(userId);
    console.log(`[e2e] usuario de prueba borrado: ${userId}`);
  } catch (error) {
    // Never fail the run over cleanup -- but say so loudly, because a
    // leftover account is exactly the kind of thing that goes unnoticed.
    console.error("[e2e] no se pudo borrar el usuario de prueba:", error);
  } finally {
    await rm(STATE_FILE, { force: true });
  }
}
