import { abrirPeticion, esRechazo, respuesta } from "@/lib/puente/peticion";
import { markdownPorElPuente } from "@/lib/puente/proyecto";
import { createAdminClient } from "@/lib/supabase/admin";

/** El proyecto como archivo, con sus ids, para la siguiente vuelta de Claude. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const peticion = await abrirPeticion(request);
  if (esRechazo(peticion)) return peticion;

  const { slug } = await params;
  const r = await markdownPorElPuente(createAdminClient(), peticion.userId, slug);
  if (r.error) return respuesta({ error: r.error }, 404);
  return respuesta({ nombre: r.nombre, texto: r.texto });
}
