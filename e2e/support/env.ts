/**
 * What the end-to-end suite needs before it can run anything.
 *
 * These tests drive the real app against a real Supabase project, because
 * almost every page in it goes through auth middleware and RLS -- a run
 * against a fake project would only prove that a broken database produces
 * an error page. So instead of failing when credentials are absent, the
 * suite reports itself as skipped: contributors without access still get a
 * green `npm test`, and CI runs the full thing only where the secrets exist.
 *
 * Two ways to supply an account:
 *
 *   1. SUPABASE_SERVICE_ROLE_KEY -- the suite creates a throwaway user for
 *      the run and deletes it afterwards. This is what CI uses.
 *   2. E2E_USER_EMAIL + E2E_USER_PASSWORD -- an account you provisioned
 *      yourself. The suite signs in as it and never creates or deletes
 *      anything, which is the only safe option when you don't want to hand
 *      a test runner service-role access.
 *
 * Note that the CSV import tests also need the *server* to have a
 * service-role key, since importing writes through it. With option 2 those
 * specific tests will fail, by design -- an import that can't write is a
 * real failure, not something to skip past.
 */

const externalEmail = process.env.E2E_USER_EMAIL ?? "";
const externalPassword = process.env.E2E_USER_PASSWORD ?? "";

export const E2E_ENV = {
  baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

/** True when the account was provisioned outside the suite, so it must not be deleted. */
export const USES_EXTERNAL_USER = Boolean(externalEmail && externalPassword);

/** True when a sign-in is possible at all, i.e. when the suite is meaningful. */
export const E2E_READY =
  Boolean(E2E_ENV.supabaseUrl) && (Boolean(E2E_ENV.serviceRoleKey) || USES_EXTERNAL_USER);

export const SKIP_REASON =
  "e2e omitido: define NEXT_PUBLIC_SUPABASE_URL y, o bien SUPABASE_SERVICE_ROLE_KEY, o bien E2E_USER_EMAIL + E2E_USER_PASSWORD.";

/**
 * A per-run account, so a failed run never leaves state that changes what
 * the next one sees, and two runs can overlap without fighting each other.
 */
const RUN_ID = process.env.E2E_RUN_ID ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const TEST_USER = USES_EXTERNAL_USER
  ? { email: externalEmail, password: externalPassword }
  : {
      email: `e2e-${RUN_ID}@example.test`,
      // Not a secret: this account is created and destroyed inside one run
      // and only ever exists on the project the operator points at.
      password: `E2e-${RUN_ID}-Aa1!`,
    };

/** Where global setup leaves the created user id for teardown to pick up. */
export const STATE_FILE = "e2e/.auth/run-state.json";
