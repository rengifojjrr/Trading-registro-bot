import { leerFeed, FEED_LIMITE, FEED_LIMITE_MAX } from "@/lib/puente/feed";
import { abrirPeticion, esRechazo, respuesta } from "@/lib/puente/peticion";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * El feed de cambios: `?after=<seq>&limit=<n>`. Cada llamada cuenta también
 * como latido (lo apunta `abrirPeticion`).
 */
export async function GET(request: Request) {
  const peticion = await abrirPeticion(request);
  if (esRechazo(peticion)) return peticion;

  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? String(FEED_LIMITE));
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > FEED_LIMITE_MAX) {
    return respuesta({ error: "consulta" }, 400);
  }

  try {
    const pagina = await leerFeed(createAdminClient(), peticion.userId, after, limit);
    return respuesta(pagina);
  } catch {
    return respuesta({ error: "reintentar" }, 503);
  }
}
