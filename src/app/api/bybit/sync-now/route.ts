import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { resolveBybitDemoAccountId } from "@/lib/sync/account";
import { runPollSync } from "@/lib/sync/orchestrator";

export const maxDuration = 60;

/**
 * Conecta la cuenta demo de Bybit y trae lo que haya, ahora.
 *
 * Es el espejo de `api/coinbase/sync-now` y por el mismo motivo: hace falta un
 * gesto explícito que cree la fila de la cuenta y compruebe que las
 * credenciales sirven, antes de encender el cron y confiar en que corra solo.
 * No mira `auto_sync_enabled` -- ése es el interruptor del cron, no de un clic.
 *
 * `is_demo: true` en la cuenta es lo que hace que sus operaciones salgan
 * marcadas como dinero de papel y no se sumen al P&L real: lo deriva un
 * disparador de la base, así que aquí basta con decir la verdad sobre la
 * cuenta. Ver `20260923120000_el_dinero_de_papel_no_se_suma_al_real.sql`.
 */
export async function GET() {
  const user = await requireUser();
  const env = serverEnv();

  if (!env.BYBIT_DEMO_API_KEY || !env.BYBIT_DEMO_API_SECRET || !env.BYBIT_SYMBOLS) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "La cuenta demo de Bybit no está configurada en este servidor. Faltan BYBIT_DEMO_API_KEY, BYBIT_DEMO_API_SECRET y/o BYBIT_SYMBOLS.",
      },
      { status: 200 },
    );
  }

  const accountId = await resolveBybitDemoAccountId(user.id);
  if (!accountId) {
    return NextResponse.json(
      { ok: false, message: "No se pudo crear la cuenta de Bybit demo." },
      { status: 500 },
    );
  }

  try {
    const summary = await runPollSync(accountId);
    return NextResponse.json({ ok: summary.status !== "FAILED", accountId, ...summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        accountId,
        message: error instanceof Error ? error.message : "Error desconocido al sincronizar Bybit.",
      },
      { status: 200 },
    );
  }
}
