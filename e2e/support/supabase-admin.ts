import { E2E_ENV } from "./env";

/**
 * The bit of Supabase admin API the suite needs, over plain fetch.
 *
 * Deliberately not the supabase-js client: this file runs in Playwright's
 * node process, outside Next's module graph, and pulling in the app's own
 * `server-only`-guarded clients from here would either fail or quietly
 * weaken that guard.
 */

function headers() {
  return {
    apikey: E2E_ENV.serviceRoleKey,
    Authorization: `Bearer ${E2E_ENV.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

export async function createTestUser(email: string, password: string): Promise<string> {
  const res = await fetch(`${E2E_ENV.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  const body = (await res.json()) as { id?: string; msg?: string; message?: string };
  if (!res.ok || !body.id) {
    throw new Error(`No se pudo crear el usuario de prueba (${res.status}): ${body.msg ?? body.message ?? ""}`);
  }
  return body.id;
}

/**
 * Deleting the auth user is the whole cleanup: every table the app owns
 * references auth.users with `on delete cascade`, so the account's trades,
 * fills, imports and settings go with it. If that ever stops being true,
 * this suite will start leaving rows behind -- which is a schema problem
 * worth noticing, not something to paper over with manual deletes here.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const res = await fetch(`${E2E_ENV.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`No se pudo borrar el usuario de prueba (${res.status}).`);
  }
}

/** Deletes any account left over from an earlier run that crashed before teardown. */
export async function deleteStaleTestUsers(maxAgeMs = 6 * 60 * 60 * 1000): Promise<number> {
  const res = await fetch(`${E2E_ENV.supabaseUrl}/auth/v1/admin/users?per_page=200`, {
    headers: headers(),
  });
  if (!res.ok) return 0;

  const { users } = (await res.json()) as { users: { id: string; email: string; created_at: string }[] };
  const stale = users.filter(
    (u) => /^e2e-.*@example\.test$/.test(u.email) && Date.now() - Date.parse(u.created_at) > maxAgeMs,
  );

  for (const user of stale) await deleteTestUser(user.id);
  return stale.length;
}
