import "server-only";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * La cuenta real de Coinbase de un usuario, creándola si es la primera vez.
 *
 * Vivía dentro de la ruta de «Sincronizar ahora», que era el único sitio
 * desde el que se lanzaba una sincronización. Ahora también se lanza desde el
 * aviso de posición fantasma, y las dos tienen que resolver la misma cuenta o
 * acabarían creando dos.
 *
 * `portfolio_id` es sólo una etiqueta descriptiva: los endpoints REST de
 * Coinbase no aceptan filtro por portafolio -- una clave CDP ya está acotada a
 * uno -- así que un valor de relleno basta y evita un paso de «conectar
 * portafolio» para algo que hoy es siempre una cuenta por usuario.
 */
export async function resolveCoinbaseAccountId(userId: string): Promise<string | null> {
  const env = serverEnv();
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("venue", env.COINBASE_PRODUCT_VENUE)
    .eq("connector", "COINBASE")
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      portfolio_id: "default",
      venue: env.COINBASE_PRODUCT_VENUE,
      name: "Coinbase",
      is_demo: false,
      connector: "COINBASE",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[sync] no se pudo crear la cuenta de Coinbase", error);
    return null;
  }

  return created.id;
}

/**
 * La cuenta demo de Bybit de un usuario, creándola si es la primera vez.
 *
 * `is_demo: true` no es un detalle administrativo: es de donde sale
 * `trades.is_paper`, que es lo que mantiene el dinero ficticio fuera del P&L
 * real. Un disparador de la base lo deriva de aquí, así que esta línea es la
 * que decide si tus prácticas contaminan tus cifras de verdad.
 *
 * `venue: "EXTERNAL"` porque no es ninguno de los dos venues de Coinbase, y
 * `connector: "BYBIT_DEMO"` porque eso es otra pregunta: dice a quién hay que
 * preguntarle por los fills. Las dos columnas existían ya menos la última.
 */
export async function resolveBybitDemoAccountId(userId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("connector", "BYBIT_DEMO")
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      portfolio_id: "demo",
      venue: "EXTERNAL",
      name: "Bybit demo",
      // Lo que mantiene el dinero de prácticas fuera de las cifras reales.
      is_demo: true,
      connector: "BYBIT_DEMO",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[sync] no se pudo crear la cuenta de Bybit demo", error);
    return null;
  }

  return created.id;
}
