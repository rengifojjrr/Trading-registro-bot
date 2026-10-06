import "server-only";

import { coincideSecreto, portadorDe } from "@/lib/auth/secreto";
import { serverEnv } from "@/lib/env";

/**
 * Every /api/cron/* route calls this first. Matches Vercel Cron's own
 * convention (Authorization: Bearer $CRON_SECRET) so the same route works
 * whether it's triggered by Vercel Cron, a Supabase pg_cron -> HTTP call,
 * or a manual `curl` during testing -- see README.md's deploy section.
 *
 * Es la única puerta de esas rutas: `/api/cron` está en la lista de lo que el
 * guardián de sesión deja pasar (un reloj no tiene sesión), así que lo que no
 * compruebe esto no lo comprueba nadie. Por eso compara en tiempo constante
 * (`coincideSecreto`) y no con un `!==`, que le diría a quien prueba cuántos
 * caracteres del principio acertó.
 */
export function verifyCronRequest(request: Request): { ok: true } | { ok: false; status: number } {
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    return { ok: false, status: 500 };
  }
  const presentado = portadorDe(request.headers.get("authorization"));
  if (!coincideSecreto(presentado, env.CRON_SECRET)) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
