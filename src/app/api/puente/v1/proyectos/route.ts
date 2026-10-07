import { abrirPeticion, esRechazo, respuesta } from "@/lib/puente/peticion";
import { listaPorElPuente } from "@/lib/puente/proyecto";
import { createAdminClient } from "@/lib/supabase/admin";

/** La lista de proyectos (nombre, slug, estado), para `proyecto.js lista`. */
export async function GET(request: Request) {
  const peticion = await abrirPeticion(request);
  if (esRechazo(peticion)) return peticion;
  return respuesta({ proyectos: await listaPorElPuente(createAdminClient(), peticion.userId) });
}
