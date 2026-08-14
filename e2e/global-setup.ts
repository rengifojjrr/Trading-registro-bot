import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { E2E_READY, STATE_FILE, TEST_USER, USES_EXTERNAL_USER } from "./support/env";
import { createTestUser, deleteStaleTestUsers } from "./support/supabase-admin";

/**
 * Creates the throwaway account the whole suite signs in as, and records
 * its id so teardown can remove it even if the run fails partway.
 */
export default async function globalSetup() {
  if (!E2E_READY) return;

  if (USES_EXTERNAL_USER) {
    // Somebody else owns this account -- the suite must not touch its
    // lifecycle, only sign in as it.
    console.log(`[e2e] usando la cuenta proporcionada: ${TEST_USER.email}`);
    return;
  }

  const swept = await deleteStaleTestUsers();
  if (swept > 0) console.log(`[e2e] limpiadas ${swept} cuenta(s) de ejecuciones anteriores`);

  const userId = await createTestUser(TEST_USER.email, TEST_USER.password);
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({ userId, email: TEST_USER.email }), "utf8");
  console.log(`[e2e] usuario de prueba creado: ${TEST_USER.email}`);
}
