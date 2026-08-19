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
    .eq("is_demo", false)
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
