import "server-only";

import { z } from "zod";

import { idDerivado, isUuid } from "@/core/ids";
import { todayIn } from "@/core/today";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ARCHIVO_MAX_CARACTERES, esArchivoPrivado, leerArchivoProyecto } from "@/modules/tasks/domain/project-file";
import { validarArchivo } from "@/modules/tasks/domain/project-file-schema";
import { planearImportacion, type Plan } from "@/modules/tasks/domain/project-import";
import {
  aplicarPlanImportacion,
  archivoParaClaude,
  estadoParaImportar,
  zonaDelDueno,
} from "@/modules/tasks/project-io";

/**
 * Cargar y traer un proyecto por el puente (Claude Code en la Mac, llave
 * `claude-1`), con el MISMO lector y el MISMO plan que «Importar desde Claude»
 * en la aplicación. Un solo lector: dos acaban por no coincidir.
 *
 * El archivo viaja entero como texto y se lee aquí. Los ids de lo nuevo salen
 * de la `semilla` que manda el script (igual en la prueba y al aplicar): el
 * plan que se enseñó y el que se aplica son el mismo, y su huella lo
 * comprueba. Lo que tiene que mirar el dueño (`revisar`) exige `revisado`.
 *
 * El archivo privado (`x.privado.md`, `privado: sí`) se rechaza antes de leer
 * nada más: nunca sube.
 */

type Admin = ReturnType<typeof createAdminClient>;

export const importarSchema = z
  .object({
    modo: z.enum(["prueba", "aplicar"]),
    texto: z.string().min(1).max(ARCHIVO_MAX_CARACTERES),
    nombre_archivo: z.string().max(200).optional(),
    semilla: z.uuid(),
    huella: z.string().regex(/^[0-9a-f]{16}$/).optional(),
    revisado: z.boolean().optional(),
  })
  .strict();

export type PedidoDeImportar = z.infer<typeof importarSchema>;

export type PlanParaClaude = Omit<Plan, "ops"> & { operaciones: number };

export interface RespuestaDeImportar {
  error: string | null;
  plan: PlanParaClaude | null;
  /** Al aplicar: el proyecto que quedó. */
  proyecto_id: string | null;
  /** Al aplicar con una huella vieja: algo cambió en la app desde la prueba. */
  cambiado: boolean;
}

function visible(plan: Plan): PlanParaClaude {
  const { ops, ...resto } = plan;
  return { ...resto, operaciones: ops.length };
}

/** Los ids de lo nuevo, siempre los mismos para la misma semilla. */
function idsDe(semilla: string): () => string {
  let n = 0;
  return () => idDerivado(semilla, `n${(n += 1)}`);
}

export async function importarPorElPuente(
  admin: Admin,
  userId: string,
  pedido: PedidoDeImportar,
  ahora: Date = new Date(),
): Promise<RespuestaDeImportar> {
  const vacia = { plan: null, proyecto_id: null, cambiado: false };
  if (esArchivoPrivado(pedido.texto, pedido.nombre_archivo)) {
    return { ...vacia, error: "Ese es el archivo privado del proyecto: nunca sube a la app." };
  }
  const zona = await zonaDelDueno(admin, userId);
  const hoy = todayIn(zona);
  const lectura = leerArchivoProyecto(pedido.texto, {
    hoy,
    nombreArchivo: pedido.nombre_archivo,
    nuevoId: idsDe(pedido.semilla),
  });
  if (!lectura.ok) return { ...vacia, error: lectura.error };
  const archivo = validarArchivo(lectura.archivo);
  if (!archivo) return { ...vacia, error: "El archivo no tiene la forma esperada." };

  const estado = await estadoParaImportar(admin, userId, archivo);
  const plan = planearImportacion(archivo, estado, { ahora: ahora.toISOString(), hoy });

  if (pedido.modo === "prueba" || plan.bloqueo) {
    return { ...vacia, error: plan.bloqueo, plan: visible(plan) };
  }
  if (!pedido.huella || plan.huella !== pedido.huella) {
    return {
      ...vacia,
      error: "Algo cambió desde la prueba. Míralo otra vez antes de seguir.",
      plan: visible(plan),
      cambiado: true,
    };
  }
  if (plan.revisar.length > 0 && pedido.revisado !== true) {
    return { ...vacia, error: "Hay cosas que mirar antes de crear.", plan: visible(plan) };
  }

  const { error } = await aplicarPlanImportacion(admin, userId, plan);
  if (error) {
    return {
      ...vacia,
      error: "Se guardó una parte y algo falló. Dale otra vez: lo que ya está no se repite.",
      proyecto_id: plan.nuevo ? null : plan.proyectoId,
    };
  }
  return { error: null, plan: null, proyecto_id: plan.proyectoId, cambiado: false };
}

/** El proyecto como archivo, por su slug (o su id). */
export async function markdownPorElPuente(
  admin: Admin,
  userId: string,
  slugOId: string,
): Promise<{ error: string | null; nombre: string; texto: string }> {
  const campo = isUuid(slugOId) ? "id" : "slug";
  if (campo === "slug" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugOId)) {
    return { error: "Proyecto no encontrado.", nombre: "", texto: "" };
  }
  const { data } = await admin
    .from("tasks_projects")
    .select("id")
    .eq("user_id", userId)
    .eq(campo, slugOId)
    .maybeSingle();
  if (!data) return { error: "Proyecto no encontrado.", nombre: "", texto: "" };
  return archivoParaClaude(admin, userId, data.id, await zonaDelDueno(admin, userId));
}

export interface ProyectoEnLista {
  id: string;
  slug: string | null;
  nombre: string;
  estado: string;
  nube: string;
  activo: boolean;
  actualizado: string;
}

export async function listaPorElPuente(admin: Admin, userId: string): Promise<ProyectoEnLista[]> {
  const { data } = await admin
    .from("tasks_projects")
    .select("id, slug, name, status, cloud_level, is_active, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    nombre: p.name,
    estado: p.status,
    nube: p.cloud_level,
    activo: p.is_active,
    actualizado: p.updated_at,
  }));
}
