import { abrirPeticion, esRechazo, respuesta } from "@/lib/puente/peticion";
import { importarPorElPuente, importarSchema } from "@/lib/puente/proyecto";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Un archivo de proyecto, en modo `prueba` (el plan, sin tocar nada) o
 * `aplicar` (sólo con la huella del plan que se enseñó). Lo usa Claude Code en
 * la Mac con su llave (`claude-1`); el archivo privado nunca llega aquí, y si
 * llega, se rechaza.
 */
export async function POST(request: Request) {
  const peticion = await abrirPeticion(request);
  if (esRechazo(peticion)) return peticion;

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(peticion.cuerpo);
  } catch {
    return respuesta({ error: "cuerpo" }, 400);
  }
  const pedido = importarSchema.safeParse(cuerpo);
  if (!pedido.success) return respuesta({ error: "cuerpo" }, 400);

  const admin = createAdminClient({ cabeceras: { "x-puente-cliente": peticion.cliente } });
  return respuesta(await importarPorElPuente(admin, peticion.userId, pedido.data));
}
