import { abrirPeticion, esRechazo, respuesta } from "@/lib/puente/peticion";
import { aplicarLote } from "@/lib/puente/aplicar";
import { loteSchema, OPS_POR_LOTE } from "@/lib/puente/esquemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonaDelDueno } from "@/modules/tasks/project-io";

export const maxDuration = 60;

/**
 * Un lote de operaciones del bot (hasta 50). Responde una por una, en el mismo
 * orden: `applied`, `duplicate`, `conflict` o `rejected` con su motivo.
 *
 * Nada de lo que llega se escribe en los registros: ni títulos ni nombres.
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
  const lote = loteSchema.safeParse(cuerpo);
  if (!lote.success) return respuesta({ error: "cuerpo", maximo: OPS_POR_LOTE }, 400);

  const admin = createAdminClient({ cabeceras: { "x-puente-cliente": peticion.cliente } });
  const resultados = await aplicarLote(
    {
      admin,
      userId: peticion.userId,
      cliente: peticion.cliente,
      ahora: new Date(),
      zona: await zonaDelDueno(admin, peticion.userId),
    },
    lote.data.ops,
  );
  return respuesta({ resultados });
}
