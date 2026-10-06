import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import {
  escribirArchivoProyecto,
  nombreDeArchivo,
  type ArchivoParaEscribir,
  type ArchivoProyecto,
  type TareaParaEscribir,
} from "./domain/project-file";
import { encontrarProyecto, type EstadoParaImportar, type Op, type Plan } from "./domain/project-import";
import { dateIn } from "./domain/projects";
import { todayIn } from "@/core/today";

/**
 * Leer y escribir un proyecto entero contra la base: lo que comparten
 * «Importar desde Claude» en la aplicación (con la sesión del dueño) y el
 * puente con el bot (con la clave de servicio, para `claude-1`).
 *
 * Una sola implementación para los dos caminos: dos lectores del mismo archivo
 * acaban por no coincidir. Quien llama pone el cliente y el `userId`; aquí
 * todo filtra por ese `userId`, también con la clave de servicio.
 */

export type Cliente = SupabaseClient<Database>;

/** Lo que hay en la base para un archivo dado: el proyecto que casa y todo lo suyo. */
export async function estadoParaImportar(
  supabase: Cliente,
  userId: string,
  archivo: Pick<ArchivoProyecto, "ref" | "slug" | "nombre">,
): Promise<EstadoParaImportar> {
  const [{ data: proyectos }, { data: personas }] = await Promise.all([
    supabase.from("tasks_projects").select("id, name, slug").eq("user_id", userId),
    supabase
      .from("core_people")
      .select("id, name, aliases, is_owner, archived_at, relation, note, whatsapp_hint, field_src")
      .eq("user_id", userId),
  ]);
  const lista = proyectos ?? [];
  const id = encontrarProyecto(archivo, lista);
  const base: EstadoParaImportar = {
    proyectos: lista,
    proyecto: null,
    personas: (personas ?? []) as EstadoParaImportar["personas"],
    miembros: [],
    frentes: [],
    hitos: [],
    tareas: [],
    bitacora: [],
    enlaces: [],
    ficha: null,
  };
  if (!id) return base;

  const [proyecto, miembros, frentes, hitos, tareas, bitacora, enlaces, ficha] = await Promise.all([
    supabase
      .from("tasks_projects")
      .select("id, name, slug, aliases, status, objective, how_md, how_by, started_on, target_on, color, icon, cloud_level, field_src")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("tasks_project_members").select("id, person_id, role, does_md, side, field_src").eq("user_id", userId).eq("project_id", id),
    supabase.from("tasks_streams").select("id, name, lead_person_id, field_src").eq("user_id", userId).eq("project_id", id),
    supabase
      .from("tasks_milestones")
      .select("id, kind, stage_id, title, starts_on, due_on, due_precision, status, owner_person_id, detail, field_src, former_titles")
      .eq("user_id", userId)
      .eq("project_id", id),
    supabase
      .from("tasks_items")
      .select("id, title, status, due_date, priority, assignee_id, stream_id, milestone_id, parent_id, notes, field_src, former_titles")
      .eq("user_id", userId)
      .eq("project_id", id)
      .order("created_at"),
    supabase.from("tasks_project_log").select("id, at, title").eq("user_id", userId).eq("project_id", id),
    supabase.from("tasks_project_sources").select("id, label, ref").eq("user_id", userId).eq("project_id", id),
    supabase
      .from("tasks_project_docs")
      .select("id, body_md, made_by")
      .eq("user_id", userId)
      .eq("project_id", id)
      .eq("kind", "FICHA")
      .maybeSingle(),
  ]);
  return {
    ...base,
    proyecto: (proyecto.data ?? null) as EstadoParaImportar["proyecto"],
    miembros: (miembros.data ?? []) as EstadoParaImportar["miembros"],
    frentes: (frentes.data ?? []) as EstadoParaImportar["frentes"],
    hitos: (hitos.data ?? []) as EstadoParaImportar["hitos"],
    tareas: (tareas.data ?? []) as EstadoParaImportar["tareas"],
    bitacora: (bitacora.data ?? []) as EstadoParaImportar["bitacora"],
    enlaces: (enlaces.data ?? []) as EstadoParaImportar["enlaces"],
    ficha: (ficha.data ?? null) as EstadoParaImportar["ficha"],
  };
}

/** Hace una operación del plan. Las altas no pisan nada si ya existían (mismo id). */
interface SinTipo {
  upsert: (
    filas: unknown,
    opciones: { onConflict: string; ignoreDuplicates: boolean; defaultToNull: boolean },
  ) => PromiseLike<{ error: { message: string } | null }>;
  update: (cambios: unknown) => {
    eq: (c: string, v: string) => { eq: (c: string, v: string) => PromiseLike<{ error: { message: string } | null }> };
  };
}

/**
 * Escribe las operaciones de un plan ya enseñado (y con su huella comprobada).
 * Las altas van en lotes por tabla y con `on conflict do nothing`: si se corta
 * a medias, darle otra vez termina lo que faltaba sin duplicar.
 */
export async function aplicarPlanImportacion(
  supabase: Cliente,
  userId: string,
  plan: Plan,
): Promise<{ error: string | null }> {
  // Lotes: altas seguidas de la misma tabla van juntas, en orden.
  const lotes: { tabla: Op["tabla"]; ops: Op[] }[] = [];
  for (const op of plan.ops) {
    const ultimo = lotes[lotes.length - 1];
    if (op.accion === "crear" && ultimo && ultimo.tabla === op.tabla && ultimo.ops[0].accion === "crear") {
      ultimo.ops.push(op);
    } else {
      lotes.push({ tabla: op.tabla, ops: [op] });
    }
  }

  for (const lote of lotes) {
    const tabla = supabase.from(lote.tabla) as unknown as SinTipo;
    const [primera] = lote.ops;
    const { error } =
      primera.accion === "crear"
        ? await tabla.upsert(
            lote.ops.map((o) => ({ ...(o as Extract<Op, { accion: "crear" }>).fila, user_id: userId })),
            { onConflict: "id", ignoreDuplicates: true, defaultToNull: false },
          )
        : await tabla.update(primera.cambios).eq("id", primera.id).eq("user_id", userId);
    if (error) return { error: error.message };
  }

  return { error: null };
}

/** La zona del dueño, de sus ajustes. */
export async function zonaDelDueno(supabase: Cliente, userId: string): Promise<string> {
  const { data } = await supabase.from("app_settings").select("timezone").eq("user_id", userId).maybeSingle();
  return data?.timezone || "UTC";
}

/** El proyecto como archivo para Claude, con los ids. */
export async function archivoParaClaude(
  supabase: Cliente,
  userId: string,
  projectId: string,
  timezone: string,
): Promise<{ error: string | null; nombre: string; texto: string }> {
  const [proyecto, miembros, personas, frentes, hitos, tareas, bitacora, enlaces, ficha] = await Promise.all([
    supabase
      .from("tasks_projects")
      .select("id, name, slug, aliases, status, objective, started_on, target_on, color, icon, how_md")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("tasks_project_members").select("person_id, role, side, does_md, active, sort_order").eq("user_id", userId).eq("project_id", projectId).order("sort_order"),
    supabase.from("core_people").select("id, name, aliases, is_owner, relation, note, whatsapp_hint").eq("user_id", userId),
    supabase.from("tasks_streams").select("id, name, lead_person_id").eq("user_id", userId).eq("project_id", projectId).order("sort_order"),
    supabase
      .from("tasks_milestones")
      .select("id, kind, stage_id, title, starts_on, due_on, due_precision, status, owner_person_id, sort_order")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("tasks_items")
      .select("id, title, status, priority, due_date, assignee_id, stream_id, milestone_id, parent_id, source_label, created_at")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("created_at"),
    supabase.from("tasks_project_log").select("id, at, kind, title, body, auto").eq("user_id", userId).eq("project_id", projectId).order("at"),
    supabase.from("tasks_project_sources").select("id, label, ref, kind").eq("user_id", userId).eq("project_id", projectId).in("kind", ["ENLACE", "DOCUMENTO", "ARCHIVO_MAC"]).order("created_at"),
    supabase
      .from("tasks_project_docs")
      .select("body_md")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("kind", "FICHA")
      .maybeSingle(),
  ]);
  const p = proyecto.data;
  if (!p) return { error: "Proyecto no encontrado.", nombre: "", texto: "" };

  const gente = new Map((personas.data ?? []).map((x) => [x.id, x]));
  const nombreDe = (id: string | null) => {
    if (!id) return null;
    const x = gente.get(id);
    if (!x) return null;
    return x.is_owner ? "yo" : x.name;
  };
  const frentePorId = new Map((frentes.data ?? []).map((f) => [f.id, f.name]));
  const hitosRows = hitos.data ?? [];
  const aHito = (h: (typeof hitosRows)[number]) => ({
    id: h.id,
    titulo: h.title,
    fecha: h.due_on,
    precision: h.due_precision,
    estado: h.status,
    responsable: nombreDe(h.owner_person_id),
  });

  const tareasRows = tareas.data ?? [];
  const aTarea = (t: (typeof tareasRows)[number]): Omit<TareaParaEscribir, "subtareas"> => ({
    id: t.id,
    titulo: t.title,
    estado: t.status,
    responsable: nombreDe(t.assignee_id),
    fecha: t.due_date,
    frente: t.stream_id ? (frentePorId.get(t.stream_id) ?? null) : null,
    hito: t.milestone_id ? (hitosRows.find((h) => h.id === t.milestone_id && h.kind === "HITO")?.title ?? null) : null,
    prioridad: t.priority,
    origen: t.source_label,
  });

  const datos: ArchivoParaEscribir = {
    id: p.id,
    nombre: p.name,
    slug: p.slug,
    alias: p.aliases,
    estado: p.status,
    objetivo: p.objective,
    inicio: p.started_on,
    meta: p.target_on,
    color: p.color,
    icono: p.icon,
    comoVa: p.how_md,
    ficha: ficha.data?.body_md ?? null,
    personas: (miembros.data ?? [])
      .filter((m) => m.active)
      .map((m) => {
        const x = gente.get(m.person_id);
        if (!x) return null;
        return {
          id: x.id,
          nombre: x.is_owner ? "Yo" : x.name,
          esYo: x.is_owner,
          alias: x.aliases,
          relacion: x.relation,
          papel: m.role,
          lado: m.side,
          hace: m.does_md,
          whatsapp: x.whatsapp_hint,
          nota: x.note,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    frentes: (frentes.data ?? []).map((f) => ({ id: f.id, nombre: f.name, responsable: nombreDe(f.lead_person_id) })),
    etapas: hitosRows
      .filter((h) => h.kind === "ETAPA")
      .map((e) => ({
        id: e.id,
        titulo: e.title,
        inicio: e.starts_on,
        fin: e.due_on,
        hitos: hitosRows.filter((h) => h.kind === "HITO" && h.stage_id === e.id).map(aHito),
      })),
    hitosSueltos: hitosRows
      .filter((h) => h.kind === "HITO" && (h.stage_id === null || !hitosRows.some((e) => e.id === h.stage_id)))
      .map(aHito),
    tareas: tareasRows
      .filter((t) => t.parent_id === null || !tareasRows.some((x) => x.id === t.parent_id))
      .map((t) => ({ ...aTarea(t), subtareas: tareasRows.filter((s) => s.parent_id === t.id).map(aTarea) })),
    bitacora: (bitacora.data ?? [])
      .filter((b) => !b.auto)
      .map((b) => ({
        id: b.id,
        fecha: dateIn(b.at, timezone),
        tipo: b.kind,
        texto: b.body ?? b.title,
      })),
    enlaces: (enlaces.data ?? []).map((l) => ({ id: l.id, etiqueta: l.label, url: l.kind === "ENLACE" ? l.ref : null, enMac: l.kind !== "ENLACE" })),
    hoy: todayIn(timezone),
  };

  return { error: null, nombre: nombreDeArchivo(p.slug, p.name), texto: escribirArchivoProyecto(datos) };
}
