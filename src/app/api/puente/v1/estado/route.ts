import { OPERACIONES } from "@/lib/puente/esquemas";
import { PUENTE_VERSION } from "@/lib/puente/firma";
import { abrirPeticion, esRechazo, respuesta } from "@/lib/puente/peticion";
import { NOMBRES_DE_ENTIDAD } from "@/lib/puente/tablas";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonaDelDueno } from "@/modules/tasks/project-io";

/**
 * Lo que el bot necesita saber de la aplicación: la hora (para medir cuánto se
 * desvía su reloj), la zona del dueño, la versión del protocolo, las
 * operaciones que entiende y qué otros clientes han hablado hace poco.
 */
export async function GET(request: Request) {
  const peticion = await abrirPeticion(request);
  if (esRechazo(peticion)) return peticion;

  const admin = createAdminClient();
  const { data: clientes } = await admin
    .from("puente_clientes")
    .select("cliente, visto_en, estado_en, dos_motores_en")
    .eq("user_id", peticion.userId);

  return respuesta({
    ahora: Math.floor(Date.now() / 1000),
    zona: await zonaDelDueno(admin, peticion.userId),
    version: PUENTE_VERSION,
    cliente: peticion.cliente,
    operaciones: OPERACIONES,
    entidades: NOMBRES_DE_ENTIDAD,
    clientes: (clientes ?? []).map((c) => ({
      cliente: c.cliente,
      visto_en: c.visto_en,
      estado_en: c.estado_en,
      dos_motores_en: c.dos_motores_en,
    })),
  });
}
