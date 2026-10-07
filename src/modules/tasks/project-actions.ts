"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { isUuid } from "@/core/ids";
import { colorForName } from "@/core/notion-colors";
import { PERSON_NAME_MAX, PERSON_NOTE_MAX, PERSON_RELATION_MAX, phoneTail } from "@/core/people";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { FieldSrc, LogKind, MilestoneStatus, ProjectHealth, ProjectStatus } from "@/types/database";

import { validarArchivo } from "./domain/project-file-schema";
import { planearImportacion, type Plan } from "./domain/project-import";
import {
  LOG_KIND_LABELS,
  MANUAL_HEALTH_DAYS,
  MILESTONE_STATUS_LABELS,
  PROJECT_LIMITS,
  PROJECT_STATUS_LABELS,
  freeSlug,
  projectNameSchema,
} from "./domain/projects";
import { aplicarPlanImportacion, archivoParaClaude, estadoParaImportar } from "./project-io";
import { aliasConNombreDeAntes, titulosDeAntes } from "./domain/renames";
import { PRIORITIES, STATUSES } from "./domain/tasks";

/**
 * Lo que se cambia en los proyectos, sus personas y su hoja de ruta.
 *
 * Todo con la sesión del dueño: las RLS y las claves compuestas de la base son
 * la última palabra, y aquí cada entrada se valida con zod antes de llegar.
 *
 * Cada campo que tocas aquí queda marcado como tuyo (`field_src = 'owner'`):
 * importar un archivo después ya no lo pisa.
 */

export type ActionResult = { error: string | null };
const OK: ActionResult = { error: null };

// ------------------------------------------------------------------ ayudas

type Supabase = Awaited<ReturnType<typeof createClient>>;

type TablaConMarca =
  | "tasks_projects"
  | "tasks_items"
  | "core_people"
  | "tasks_project_members"
  | "tasks_streams"
  | "tasks_milestones";

/**
 * La marca de quién escribió, con estos campos puestos como tuyos.
 *
 * Lee la marca de la fila y la devuelve mezclada: se escribe en el mismo
 * `update` que el cambio. Si la fila no es tuya, la RLS no la deja leer y no
 * hay nada que marcar.
 */
async function marcaDelDueno(
  supabase: Supabase,
  tabla: TablaConMarca,
  id: string,
  userId: string,
  campos: string[],
): Promise<FieldSrc | null> {
  const { data } = await supabase.from(tabla).select("field_src").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const src: FieldSrc = { ...((data as { field_src: FieldSrc }).field_src ?? {}) };
  for (const campo of campos) src[campo] = "owner";
  return src;
}

/**
 * Si el cambio renombra una tarea o un hito, el título de antes se guarda en
 * `former_titles` (ver domain/renames.ts): así el archivo de Claude de la vuelta
 * siguiente, que aún trae el título viejo, casa con ella en vez de duplicarla.
 */
async function titulosDeAntesSiRenombra(
  supabase: Supabase,
  tabla: "tasks_items" | "tasks_milestones",
  id: string,
  userId: string,
  nuevo: string | undefined,
): Promise<{ former_titles?: string[] }> {
  if (nuevo === undefined) return {};
  const { data } = await supabase.from(tabla).select("title, former_titles").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) return {};
  const fila = data as { title: string; former_titles: string[] | null };
  const lista = titulosDeAntes(fila.title, fila.former_titles ?? [], nuevo);
  return lista ? { former_titles: lista } : {};
}

/** Lo que cada cambio tiene que refrescar: la lista, la ficha, Hoy y personas. */
function refrescar(projectId?: string | null): void {
  revalidatePath("/");
  revalidatePath("/tareas");
  revalidatePath("/tareas/todas");
  revalidatePath("/tareas/proyectos");
  if (projectId) revalidatePath(`/tareas/proyectos/${projectId}`);
  revalidatePath("/personas");
}

const vacioANulo = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), inner.nullable());

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida.");

/** Tu fila «Yo». Se crea la primera vez que hace falta. */
async function filaYo(supabase: Supabase, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("core_people")
    .select("id")
    .eq("user_id", userId)
    .eq("is_owner", true)
    .maybeSingle();
  if (data) return data.id;
  const { data: nueva } = await supabase
    .from("core_people")
    .insert({ user_id: userId, name: "Yo", is_owner: true, field_src: { name: "owner" } })
    .select("id")
    .single();
  return nueva?.id ?? null;
}

async function apuntarEnBitacora(
  supabase: Supabase,
  userId: string,
  projectId: string,
  kind: LogKind,
  title: string,
): Promise<void> {
  await supabase.from("tasks_project_log").insert({
    user_id: userId,
    project_id: projectId,
    kind,
    title: title.slice(0, PROJECT_LIMITS.logTitle),
    auto: true,
    origin: "A_MANO",
  });
}

// ------------------------------------------------------------------ proyecto

const nuevoProyectoSchema = z.object({
  name: projectNameSchema,
  objective: vacioANulo(z.string().trim().max(PROJECT_LIMITS.objective, "Objetivo: máximo 300 caracteres.")),
});

/** Un proyecto nuevo, con su slug y su color. Devuelve su id para abrirlo. */
export async function createProjectV2(
  _prev: ActionResult & { id?: string | null },
  formData: FormData,
): Promise<ActionResult & { id: string | null }> {
  const user = await requireUser();
  const parsed = nuevoProyectoSchema.safeParse({ name: formData.get("name"), objective: formData.get("objective") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos.", id: null };

  const supabase = await createClient();
  const { data: otros } = await supabase.from("tasks_projects").select("name, slug").eq("user_id", user.id);
  if ((otros ?? []).some((p) => p.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return { error: "Ya tienes un proyecto con ese nombre.", id: null };
  }
  const slug = freeSlug(parsed.data.name, (otros ?? []).map((p) => p.slug).filter((s): s is string => s !== null));

  const { data, error } = await supabase
    .from("tasks_projects")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      slug,
      objective: parsed.data.objective,
      color: colorForName(parsed.data.name),
      status: "EN_MARCHA",
      started_on: todayIn(await userTimezone()),
      field_src: { name: "owner", objective: "owner", status: "owner", started_on: "owner" },
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear el proyecto.", id: null };

  refrescar(data.id);
  return { error: null, id: data.id };
}

const camposProyecto = z
  .object({
    name: projectNameSchema,
    objective: vacioANulo(z.string().trim().max(PROJECT_LIMITS.objective, "Objetivo: máximo 300 caracteres.")),
    status: z.enum(["IDEA", "EN_MARCHA", "ESPERANDO", "ATASCADO", "EN_PAUSA", "TERMINADO", "DESCARTADO"]),
    started_on: vacioANulo(fecha),
    target_on: vacioANulo(fecha),
    aliases: z.array(z.string().trim().min(1).max(60)).max(20),
    icon: vacioANulo(z.string().max(8)),
  })
  .partial()
  .strict();

export type ProjectPatch = z.input<typeof camposProyecto>;

/** Cambia campos del proyecto. Un cambio de estado se apunta en la bitácora. */
export async function updateProjectFields(projectId: string, patch: ProjectPatch): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const parsed = camposProyecto.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const cambios = parsed.data;
  if (Object.keys(cambios).length === 0) return OK;

  const supabase = await createClient();
  const { data: antes } = await supabase
    .from("tasks_projects")
    .select("status, name")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!antes) return { error: "Proyecto no encontrado." };

  const src = await marcaDelDueno(supabase, "tasks_projects", projectId, user.id, Object.keys(cambios));
  const extra: Record<string, unknown> = {};
  if (cambios.status && cambios.status !== antes.status) {
    const hoy = todayIn(await userTimezone());
    extra.closed_on = cambios.status === "TERMINADO" || cambios.status === "DESCARTADO" ? hoy : null;
  }

  const { error } = await supabase
    .from("tasks_projects")
    .update({ ...cambios, ...extra, field_src: src ?? {} })
    .eq("id", projectId)
    .eq("user_id", user.id);
  if (error) {
    return { error: error.code === "23505" ? "Ya tienes un proyecto con ese nombre." : "No se pudo guardar." };
  }

  if (cambios.status && cambios.status !== antes.status) {
    await apuntarEnBitacora(
      supabase,
      user.id,
      projectId,
      "ESTADO",
      `Pasó de «${PROJECT_STATUS_LABELS[antes.status as ProjectStatus]}» a «${PROJECT_STATUS_LABELS[cambios.status]}»`,
    );
  }
  refrescar(projectId);
  return OK;
}

/**
 * Fija el semáforo a mano durante catorce días, o lo devuelve a la cuenta.
 *
 * Manda lo tuyo mientras dure; después, la aplicación vuelve a calcularlo y te
 * sugiere revisarlo.
 */
export async function setProjectHealth(projectId: string, health: ProjectHealth | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  if (health !== null && !["VERDE", "AMARILLO", "ROJO"].includes(health)) return { error: "Semáforo no válido." };

  const supabase = await createClient();
  const until = health === null ? null : new Date(Date.now() + MANUAL_HEALTH_DAYS * 86_400_000).toISOString();
  const { error } = await supabase
    .from("tasks_projects")
    .update({ health, health_until: until })
    .eq("id", projectId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar." };

  await apuntarEnBitacora(
    supabase,
    user.id,
    projectId,
    "ESTADO",
    health === null ? "El semáforo vuelve a calcularse solo" : `Semáforo puesto a mano: ${{ VERDE: "bien", AMARILLO: "atención", ROJO: "riesgo" }[health]}`,
  );
  refrescar(projectId);
  return OK;
}

/** «Cómo va»: tu frase, con fecha. */
export async function saveHow(projectId: string, texto: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const limpio = texto.trim();
  if (limpio.length > PROJECT_LIMITS.how) return { error: `Máximo ${PROJECT_LIMITS.how} caracteres.` };

  const supabase = await createClient();
  const src = await marcaDelDueno(supabase, "tasks_projects", projectId, user.id, ["how_md"]);
  const { error } = await supabase
    .from("tasks_projects")
    .update({
      how_md: limpio === "" ? null : limpio,
      how_at: new Date().toISOString(),
      how_by: "OWNER",
      field_src: src ?? {},
    })
    .eq("id", projectId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar." };
  refrescar(projectId);
  return OK;
}

// ------------------------------------------------------------------ personas

const personaSchema = z
  .object({
    name: z.string().trim().min(1, "Ponle nombre.").max(PERSON_NAME_MAX, `Máximo ${PERSON_NAME_MAX} caracteres.`),
    aliases: z.array(z.string().trim().min(1).max(60)).max(20),
    relation: vacioANulo(z.string().trim().max(PERSON_RELATION_MAX)),
    org: vacioANulo(z.string().trim().max(120)),
    circle: vacioANulo(z.enum(["FAMILIA", "AMIGOS", "TRABAJO", "CLIENTES", "SERVICIOS", "OTROS"])),
    note: vacioANulo(z.string().trim().max(PERSON_NOTE_MAX, `La nota: máximo ${PERSON_NOTE_MAX} caracteres.`)),
    whatsapp_hint: vacioANulo(z.enum(["SI", "NO"])),
    // Sólo las cuatro últimas cifras: el teléfono entero nunca se guarda.
    phone_tail: vacioANulo(z.string().max(30)).transform((v) => (v === null ? null : phoneTail(v))),
  })
  .partial()
  .strict();

export type PersonPatch = z.input<typeof personaSchema>;

export async function createPerson(patch: PersonPatch): Promise<ActionResult & { id: string | null }> {
  const user = await requireUser();
  const parsed = personaSchema.safeParse(patch);
  if (!parsed.success || !parsed.data.name) {
    return { error: parsed.success ? "Ponle nombre." : (parsed.error.issues[0]?.message ?? "Datos no válidos."), id: null };
  }
  const supabase = await createClient();
  const datos = parsed.data;
  const src: FieldSrc = {};
  for (const k of Object.keys(datos)) src[k] = "owner";
  const { data, error } = await supabase
    .from("core_people")
    .insert({ ...datos, name: datos.name as string, user_id: user.id, field_src: src })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la persona.", id: null };
  refrescar();
  return { error: null, id: data.id };
}

export async function updatePerson(
  personId: string,
  patch: PersonPatch,
): Promise<ActionResult & { aliases?: string[] }> {
  const user = await requireUser();
  if (!isUuid(personId)) return { error: "Persona no encontrada." };
  const parsed = personaSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  if (Object.keys(parsed.data).length === 0) return OK;

  const supabase = await createClient();
  const src = await marcaDelDueno(supabase, "core_people", personId, user.id, Object.keys(parsed.data));
  if (!src) return { error: "Persona no encontrada." };
  // Renombrar: el nombre de antes pasa a sus alias, para que el archivo de
  // Claude que aún la llama así la encuentre en vez de crear otra.
  const extra: { aliases?: string[] } = {};
  if (parsed.data.name !== undefined) {
    const { data: antes } = await supabase
      .from("core_people")
      .select("name, aliases, is_owner")
      .eq("id", personId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (antes && !antes.is_owner) {
      const alias = aliasConNombreDeAntes(antes.name, parsed.data.aliases ?? antes.aliases ?? [], parsed.data.name);
      if (alias) {
        extra.aliases = alias;
        src.aliases = "owner";
      }
    }
  }
  const { error } = await supabase
    .from("core_people")
    .update({ ...parsed.data, ...extra, field_src: src })
    .eq("id", personId)
    .eq("user_id", user.id);
  if (error) return { error: "No se pudo guardar." };
  refrescar();
  revalidatePath(`/personas/${personId}`);
  // Los alias como quedaron, para que el formulario no los pierda al guardar
  // otra vez (el nombre de antes acaba de entrar en ellos).
  return extra.aliases ? { error: null, aliases: extra.aliases } : OK;
}

/** Archivar a una persona la saca de las listas sin borrar su historia. */
export async function setPersonArchived(personId: string, archived: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(personId)) return { error: "Persona no encontrada." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("core_people")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", personId)
    .eq("user_id", user.id)
    .eq("is_owner", false);
  if (error) return { error: "No se pudo guardar." };
  refrescar();
  revalidatePath(`/personas/${personId}`);
  return OK;
}

// ------------------------------------------------------------------ miembros

const miembroSchema = z
  .object({
    role: vacioANulo(z.string().trim().max(PROJECT_LIMITS.memberRole, "El papel: máximo 80 caracteres.")),
    does_md: vacioANulo(z.string().trim().max(PROJECT_LIMITS.memberDoes, "«Qué hace»: máximo 600 caracteres.")),
    side: vacioANulo(z.enum(["NOSOTROS", "CONTRAPARTE", "ASESOR", "OTRO"])),
    is_lead: z.boolean(),
  })
  .partial()
  .strict();

export type MemberPatch = z.input<typeof miembroSchema>;

/**
 * Mete a alguien en un proyecto: a una persona que ya existe, a ti («yo») o a
 * alguien nuevo por su nombre.
 */
export async function addMember(
  projectId: string,
  who: { personId: string } | { me: true } | { newName: string },
  patch: MemberPatch,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const parsed = miembroSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const supabase = await createClient();
  let personId: string | null = null;
  if ("personId" in who) {
    personId = isUuid(who.personId) ? who.personId : null;
  } else if ("me" in who) {
    personId = await filaYo(supabase, user.id);
  } else {
    const creada = await createPerson({ name: who.newName });
    if (creada.error) return { error: creada.error };
    personId = creada.id;
  }
  if (!personId) return { error: "Persona no encontrada." };

  const src: FieldSrc = {};
  for (const k of Object.keys(parsed.data)) src[k] = "owner";
  const { error } = await supabase.from("tasks_project_members").upsert(
    { user_id: user.id, project_id: projectId, person_id: personId, active: true, ...parsed.data, field_src: src },
    { onConflict: "project_id,person_id" },
  );
  if (error) return { error: "No se pudo añadir." };
  refrescar(projectId);
  return OK;
}

export async function updateMember(memberId: string, patch: MemberPatch): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(memberId)) return { error: "No encontrado." };
  const parsed = miembroSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const supabase = await createClient();
  const src = await marcaDelDueno(supabase, "tasks_project_members", memberId, user.id, Object.keys(parsed.data));
  if (!src) return { error: "No encontrado." };
  const { data, error } = await supabase
    .from("tasks_project_members")
    .update({ ...parsed.data, field_src: src })
    .eq("id", memberId)
    .eq("user_id", user.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "No se pudo guardar." };
  refrescar(data?.project_id);
  return OK;
}

/** Sacar a alguien del proyecto no lo borra: deja de estar activo. */
export async function setMemberActive(memberId: string, active: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(memberId)) return { error: "No encontrado." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks_project_members")
    .update({ active })
    .eq("id", memberId)
    .eq("user_id", user.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "No se pudo guardar." };
  refrescar(data?.project_id);
  return OK;
}

// ------------------------------------------------------------------ frentes

export async function addStream(projectId: string, name: string, leadPersonId: string | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const nombre = name.trim();
  if (nombre === "" || nombre.length > PROJECT_LIMITS.streamName) return { error: "El frente: de 1 a 60 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks_streams").insert({
    user_id: user.id,
    project_id: projectId,
    name: nombre,
    lead_person_id: leadPersonId && isUuid(leadPersonId) ? leadPersonId : null,
    field_src: { name: "owner", lead_person_id: "owner" },
  });
  if (error) return { error: error.code === "23505" ? "Ya hay un frente con ese nombre." : "No se pudo crear." };
  refrescar(projectId);
  return OK;
}

// ------------------------------------------------------------- hoja de ruta

const hitoSchema = z
  .object({
    kind: z.enum(["ETAPA", "HITO"]),
    title: z.string().trim().min(1, "Ponle título.").max(PROJECT_LIMITS.milestoneTitle),
    stage_id: vacioANulo(z.string().uuid()),
    starts_on: vacioANulo(fecha),
    due_on: vacioANulo(fecha),
    due_precision: z.enum(["DIA", "SEMANA", "MES", "TRIMESTRE"]),
    owner_person_id: vacioANulo(z.string().uuid()),
    detail: vacioANulo(z.string().trim().max(PROJECT_LIMITS.milestoneDetail)),
    blocked_why: vacioANulo(z.string().trim().max(300)),
  })
  .partial()
  .strict();

export type MilestonePatch = z.input<typeof hitoSchema>;

export async function addMilestone(projectId: string, patch: MilestonePatch): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const parsed = hitoSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  if (!parsed.data.kind || !parsed.data.title) return { error: "Ponle título." };
  if (parsed.data.starts_on && parsed.data.due_on && parsed.data.due_on < parsed.data.starts_on) {
    return { error: "La fecha final va después de la de inicio." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("tasks_milestones")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("project_id", projectId);
  const src: FieldSrc = {};
  for (const k of Object.keys(parsed.data)) src[k] = "owner";
  const { error } = await supabase.from("tasks_milestones").insert({
    ...parsed.data,
    kind: parsed.data.kind,
    title: parsed.data.title,
    stage_id: parsed.data.kind === "ETAPA" ? null : (parsed.data.stage_id ?? null),
    user_id: user.id,
    project_id: projectId,
    sort_order: (count ?? 0) + 1,
    field_src: src,
  });
  if (error) return { error: "No se pudo crear." };
  refrescar(projectId);
  return OK;
}

export async function updateMilestone(milestoneId: string, patch: MilestonePatch): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(milestoneId)) return { error: "No encontrado." };
  const parsed = hitoSchema.omit({ kind: true }).safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const supabase = await createClient();
  const src = await marcaDelDueno(supabase, "tasks_milestones", milestoneId, user.id, Object.keys(parsed.data));
  if (!src) return { error: "No encontrado." };
  const antes = await titulosDeAntesSiRenombra(supabase, "tasks_milestones", milestoneId, user.id, parsed.data.title);
  const { data, error } = await supabase
    .from("tasks_milestones")
    .update({ ...parsed.data, ...antes, field_src: src })
    .eq("id", milestoneId)
    .eq("user_id", user.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "No se pudo guardar." };
  refrescar(data?.project_id);
  revalidatePath(`/tareas/hitos/${milestoneId}`);
  return OK;
}

export async function setMilestoneStatus(milestoneId: string, status: MilestoneStatus): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(milestoneId)) return { error: "No encontrado." };
  if (!Object.keys(MILESTONE_STATUS_LABELS).includes(status)) return { error: "Estado no válido." };
  const supabase = await createClient();
  const src = await marcaDelDueno(supabase, "tasks_milestones", milestoneId, user.id, ["status"]);
  if (!src) return { error: "No encontrado." };
  const { data, error } = await supabase
    .from("tasks_milestones")
    .update({ status, done_at: status === "HECHO" ? new Date().toISOString() : null, field_src: src })
    .eq("id", milestoneId)
    .eq("user_id", user.id)
    .select("project_id, title, kind")
    .maybeSingle();
  if (error || !data) return { error: "No se pudo guardar." };
  if (status === "HECHO" && data.kind === "HITO") {
    await apuntarEnBitacora(supabase, user.id, data.project_id, "AVANCE", `Hito cumplido: ${data.title}`);
  }
  refrescar(data.project_id);
  revalidatePath(`/tareas/hitos/${milestoneId}`);
  return OK;
}

// ------------------------------------------------------------------ tareas

const tareaProyectoSchema = z
  .object({
    title: z.string().trim().min(1, "Escribe la tarea.").max(PROJECT_LIMITS.taskTitle),
    assignee: z.union([z.literal("YO"), z.literal("NADIE"), z.string().uuid()]),
    due_date: vacioANulo(fecha),
    stream_id: vacioANulo(z.string().uuid()),
    milestone_id: vacioANulo(z.string().uuid()),
    parent_id: vacioANulo(z.string().uuid()),
    priority: z.enum(PRIORITIES),
  })
  .partial()
  .strict();

export type ProjectTaskPatch = z.input<typeof tareaProyectoSchema>;

async function resolverResponsable(
  supabase: Supabase,
  userId: string,
  assignee: string | undefined,
): Promise<{ assignee_id?: string | null }> {
  if (assignee === undefined) return {};
  if (assignee === "NADIE") return { assignee_id: null };
  if (assignee === "YO") return { assignee_id: await filaYo(supabase, userId) };
  return { assignee_id: assignee };
}

/** Una tarea del proyecto, con su responsable, su frente y su hito. */
export async function addProjectTask(projectId: string, patch: ProjectTaskPatch): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const parsed = tareaProyectoSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  if (!parsed.data.title) return { error: "Escribe la tarea." };

  const supabase = await createClient();
  const { assignee, ...resto } = parsed.data;
  const responsable = await resolverResponsable(supabase, user.id, assignee ?? "YO");
  const src: FieldSrc = {};
  for (const k of [...Object.keys(resto), "assignee_id"]) src[k] = "owner";
  const { error } = await supabase.from("tasks_items").insert({
    ...resto,
    ...responsable,
    title: parsed.data.title,
    user_id: user.id,
    project_id: projectId,
    origin: "A_MANO",
    field_src: src,
  });
  if (error) return { error: "No se pudo crear la tarea." };
  refrescar(projectId);
  return OK;
}

/** Mover una tarea: a otra persona, otro frente, otro hito u otra fecha. */
export async function updateProjectTask(taskId: string, patch: ProjectTaskPatch): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(taskId)) return { error: "Tarea no encontrada." };
  const parsed = tareaProyectoSchema.safeParse(patch);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };

  const supabase = await createClient();
  const { assignee, ...resto } = parsed.data;
  const responsable = await resolverResponsable(supabase, user.id, assignee);
  const cambios = { ...resto, ...responsable };
  if (Object.keys(cambios).length === 0) return OK;
  const src = await marcaDelDueno(supabase, "tasks_items", taskId, user.id, Object.keys(cambios));
  if (!src) return { error: "Tarea no encontrada." };
  const antes = await titulosDeAntesSiRenombra(supabase, "tasks_items", taskId, user.id, resto.title);
  const { data, error } = await supabase
    .from("tasks_items")
    .update({ ...cambios, ...antes, field_src: src, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("user_id", user.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "No se pudo guardar." };
  refrescar(data?.project_id);
  revalidatePath(`/tareas/${taskId}`);
  return OK;
}

/** Marcar hecha o reabrir desde la ficha del proyecto. El estado queda como tuyo. */
export async function setProjectTaskStatus(taskId: string, status: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(taskId) || !(STATUSES as readonly string[]).includes(status)) return { error: "No válido." };
  const supabase = await createClient();
  const src = await marcaDelDueno(supabase, "tasks_items", taskId, user.id, ["status"]);
  if (!src) return { error: "Tarea no encontrada." };
  const { data, error } = await supabase
    .from("tasks_items")
    .update({
      status: status as (typeof STATUSES)[number],
      completed_at: status === "HECHA" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      field_src: src,
    })
    .eq("id", taskId)
    .eq("user_id", user.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "No se pudo guardar." };
  refrescar(data?.project_id);
  return OK;
}

// ------------------------------------------------------------------ bitácora

const entradaSchema = z
  .object({
    kind: z.enum(["NOTA", "AVANCE", "DECISION", "BLOQUEO"]),
    text: z.string().trim().min(1, "¿Qué pasó?").max(PROJECT_LIMITS.logBody, "Máximo 1500 caracteres."),
    on: vacioANulo(fecha),
  })
  .strict();

/** «¿Qué pasó?»: una entrada tuya en la bitácora. */
export async function addLogEntry(
  projectId: string,
  entry: { kind: string; text: string; on?: string | null },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const parsed = entradaSchema.safeParse(entry);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const { kind, text, on } = parsed.data;
  const title = text.length > PROJECT_LIMITS.logTitle ? `${text.slice(0, PROJECT_LIMITS.logTitle - 1).trim()}…` : text;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks_project_log").insert({
    user_id: user.id,
    project_id: projectId,
    kind,
    title,
    body: text.length > PROJECT_LIMITS.logTitle ? text : null,
    at: on ? `${on}T12:00:00Z` : new Date().toISOString(),
    origin: "A_MANO",
  });
  if (error) return { error: `No se pudo apuntar la ${LOG_KIND_LABELS[kind].toLowerCase()}.` };
  refrescar(projectId);
  return OK;
}

// ------------------------------------------------------------------ ficha

/** Guarda la ficha técnica. El texto anterior queda como versión (lo hace la base). */
export async function saveFicha(projectId: string, body: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  if (body.length > PROJECT_LIMITS.docBody) return { error: "La ficha es demasiado larga." };
  const supabase = await createClient();
  const { data: ficha } = await supabase
    .from("tasks_project_docs")
    .select("id")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .eq("kind", "FICHA")
    .maybeSingle();
  const { error } = ficha
    ? await supabase
        .from("tasks_project_docs")
        .update({ body_md: body, made_by: "OWNER" })
        .eq("id", ficha.id)
        .eq("user_id", user.id)
    : await supabase.from("tasks_project_docs").insert({
        user_id: user.id,
        project_id: projectId,
        kind: "FICHA",
        title: "Ficha técnica",
        body_md: body,
        made_by: "OWNER",
      });
  if (error) return { error: "No se pudo guardar la ficha." };
  refrescar(projectId);
  return OK;
}

/** Vuelve a una versión anterior de la ficha. La de ahora queda guardada también. */
export async function restoreFichaVersion(projectId: string, version: number): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId) || !Number.isInteger(version)) return { error: "No encontrada." };
  const supabase = await createClient();
  const { data: ficha } = await supabase
    .from("tasks_project_docs")
    .select("id")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .eq("kind", "FICHA")
    .maybeSingle();
  if (!ficha) return { error: "No encontrada." };
  const { data: antigua } = await supabase
    .from("tasks_project_doc_versions")
    .select("body_md")
    .eq("user_id", user.id)
    .eq("doc_id", ficha.id)
    .eq("version", version)
    .maybeSingle();
  if (!antigua) return { error: "Esa versión ya no está." };
  return saveFicha(projectId, antigua.body_md);
}

// ------------------------------------------------------- documentos y enlaces

const enlaceSchema = z
  .object({
    label: z.string().trim().min(1, "Ponle un nombre.").max(PROJECT_LIMITS.sourceLabel),
    url: vacioANulo(
      z
        .string()
        .trim()
        .max(PROJECT_LIMITS.sourceRef)
        .regex(/^https?:\/\/\S+$/i, "La dirección empieza por https://."),
    ),
  })
  .strict();

/** Un enlace (con su dirección) o un documento que está en tu Mac (sólo su nombre). */
export async function addSource(projectId: string, entry: { label: string; url?: string | null }): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado." };
  const parsed = enlaceSchema.safeParse({ label: entry.label, url: entry.url ?? null });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const supabase = await createClient();
  const { error } = await supabase.from("tasks_project_sources").insert({
    user_id: user.id,
    project_id: projectId,
    kind: parsed.data.url ? "ENLACE" : "ARCHIVO_MAC",
    label: parsed.data.label,
    ref: parsed.data.url,
    lives: parsed.data.url ? "NUBE" : "MAC",
    origin: "A_MANO",
  });
  if (error) return { error: "No se pudo guardar." };
  refrescar(projectId);
  return OK;
}

export async function removeSource(sourceId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isUuid(sourceId)) return { error: "No encontrado." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks_project_sources")
    .delete()
    .eq("id", sourceId)
    .eq("user_id", user.id)
    .select("project_id")
    .maybeSingle();
  if (error) return { error: "No se pudo quitar." };
  refrescar(data?.project_id);
  return OK;
}

// --------------------------------------------------------- importar y exportar

export type PlanVisible = Omit<Plan, "ops"> & { operaciones: number };

function visible(plan: Plan): PlanVisible {
  const { ops, ...resto } = plan;
  return { ...resto, operaciones: ops.length };
}

/**
 * «Así lo entendí»: el plan de importar un archivo, sin hacer nada.
 *
 * El archivo llega ya leído por el navegador y se valida aquí entero. El plan
 * se calcula en el servidor con la base de ahora; al navegador sólo vuelven
 * las frases y la huella, no las operaciones.
 */
export async function planProjectImport(valor: unknown): Promise<{ error: string | null; plan: PlanVisible | null }> {
  const user = await requireUser();
  const archivo = validarArchivo(valor);
  if (!archivo) return { error: "El archivo no tiene la forma esperada. Vuelve a leerlo.", plan: null };
  const supabase = await createClient();
  const estado = await estadoParaImportar(supabase, user.id, archivo);
  const hoy = todayIn(await userTimezone());
  const plan = planearImportacion(archivo, estado, { ahora: new Date().toISOString(), hoy });
  return { error: null, plan: visible(plan) };
}

/**
 * Importa un archivo, sólo si el plan sigue siendo el que viste.
 *
 * Si algo cambió entre «Así lo entendí» y «Crear», no se hace nada y vuelve el
 * plan nuevo. Las altas van en lotes por tabla y con `on conflict do nothing`:
 * si se corta a medias, darle otra vez termina lo que faltaba sin duplicar.
 */
export async function applyProjectImport(
  valor: unknown,
  huella: string,
): Promise<{ error: string | null; projectId: string | null; plan: PlanVisible | null; cambiado: boolean }> {
  const user = await requireUser();
  const archivo = validarArchivo(valor);
  if (!archivo) return { error: "El archivo no tiene la forma esperada. Vuelve a leerlo.", projectId: null, plan: null, cambiado: false };

  const supabase = await createClient();
  const estado = await estadoParaImportar(supabase, user.id, archivo);
  const hoy = todayIn(await userTimezone());
  const plan = planearImportacion(archivo, estado, { ahora: new Date().toISOString(), hoy });

  if (plan.bloqueo) return { error: plan.bloqueo, projectId: null, plan: visible(plan), cambiado: false };
  if (plan.huella !== huella) {
    return {
      error: "Algo cambió desde que lo revisaste. Míralo otra vez antes de seguir.",
      projectId: null,
      plan: visible(plan),
      cambiado: true,
    };
  }

  const { error } = await aplicarPlanImportacion(supabase, user.id, plan);
  refrescar(plan.proyectoId);
  if (error) {
    return {
      error: "Se guardó una parte y algo falló. Dale otra vez: lo que ya está no se repite.",
      projectId: plan.nuevo ? null : plan.proyectoId,
      plan: null,
      cambiado: false,
    };
  }
  return { error: null, projectId: plan.proyectoId, plan: null, cambiado: false };
}

/**
 * «Exportar para Claude»: el proyecto como archivo, con los ids.
 *
 * Es lo que Claude lee en la Mac para la siguiente vuelta. Lo privado no está
 * aquí porque nunca subió.
 */
export async function exportProjectForClaude(
  projectId: string,
): Promise<{ error: string | null; nombre: string; texto: string }> {
  const user = await requireUser();
  if (!isUuid(projectId)) return { error: "Proyecto no encontrado.", nombre: "", texto: "" };
  const supabase = await createClient();
  return archivoParaClaude(supabase, user.id, projectId, await userTimezone());
}
