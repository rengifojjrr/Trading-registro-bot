import { NextResponse } from "next/server";

import { syncMarketNews } from "@/lib/market-news/sync";
import { CONNECTORS_QUE_SE_SINCRONIZAN } from "@/lib/sync/adaptador-de-la-cuenta";
import { runPollSync } from "@/lib/sync/orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronRequest } from "@/lib/sync/verify-cron-request";

export const maxDuration = 60;

/**
 * Meant to fire every ~5 minutes (app_settings.sync_interval_minutes is the
 * user-configured intent; the actual cadence is whatever the external
 * scheduler is set to -- see README.md). Only ever touches accounts whose
 * owner has explicitly flipped auto_sync_enabled on, which itself must not
 * happen before docs/VALIDATION_CHECKLIST.md has passed.
 *
 * Qué cuentas se consultan lo dice `accounts.connector`, no lo que la cuenta
 * *no* es. Antes se elegían con `.eq("is_demo", false)` --«todo lo que no sea
 * de demostración»-- y en esta base eso son cinco cuentas: la de Coinbase y
 * cuatro que salieron de importar Notion y CSV. A esas cuatro les habría pedido
 * los fills **a Coinbase**. No llegó a pasar porque `auto_sync_enabled` estaba
 * apagado, y el momento en el que habría pasado es justo encenderlo para
 * sincronizar Bybit.
 */
export async function GET(request: Request) {
  const auth = verifyCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const { data: eligibleSettings } = await supabase
    .from("app_settings")
    .select("user_id")
    .eq("auto_sync_enabled", true);

  if (!eligibleSettings || eligibleSettings.length === 0) {
    return NextResponse.json({ ranFor: 0, results: [] });
  }

  const userIds = eligibleSettings.map((s) => s.user_id);
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, user_id, connector")
    .in("user_id", userIds)
    .eq("is_active", true)
    .in("connector", CONNECTORS_QUE_SE_SINCRONIZAN);

  const results = [];
  for (const account of accounts ?? []) {
    try {
      const summary = await runPollSync(account.id);
      results.push({ accountId: account.id, ...summary });
    } catch (error) {
      results.push({
        accountId: account.id,
        status: "FAILED" as const,
        errorSummary: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Los titulares, una vez y no por cuenta: son datos de referencia y no de
  // nadie. Al final y dentro de un try porque son un extra -- que la fuente de
  // noticias esté caída no puede hacer que la sincronización de operaciones
  // conste como fallida.
  let titulares: Awaited<ReturnType<typeof syncMarketNews>> | null = null;
  try {
    titulares = await syncMarketNews();
  } catch (error) {
    console.error("[cron] los titulares fallaron", error);
  }

  return NextResponse.json({ ranFor: results.length, results, titulares });
}
