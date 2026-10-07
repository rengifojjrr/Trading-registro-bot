import "server-only";

import { colorForName } from "@/core/notion-colors";
import { todayIn } from "@/core/today";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeSlug, PROJECT_LIMITS, PROJECT_STATUS_LABELS } from "@/modules/tasks/domain/projects";
import { aliasConNombreDeAntes, titulosDeAntes } from "@/modules/tasks/domain/renames";
import type { FieldSrc, Json, ProjectStatus } from "@/types/database";

import { fusionar, hechoPor, llevaDatoPrivado, marcaNueva, origenEnLaBase } from "./campos";
import { validarOperacion, type DatosDe, type Operacion, type OperacionValida, type Origen } from "./esquemas";
import type { ClientePuente } from "./firma";

/**
 * Aplicar las operaciones que manda el bot.
 *
 * Una por una y cada una con su resultado: un fallo de una no tumba las demás
 * ni hace reenviar las que ya entraron.
 *
 * - `applied`: hecha (o ya estaba así: crear algo que existe con el mismo id
 *   no duplica, marcar hecha una tarea hecha no hace nada).
 * - `duplicate`: ese `op_id` ya se aplicó; vuelve lo mismo que la primera vez.
 * - `conflict`: la fila cambió en la aplicación después de lo que vio el bot
 *   (`base_version`), o ya se decidió en otro sitio. Vuelve lo que hay ahora y
 *   el bot pregunta al dueño; no se pisa nada.
 * - `rejected`: no vale, con un motivo cerrado. `no_disponible` quiere decir
 *   «todavía no» (los recordatorios antes de que exista su tabla): el bot la
 *   guarda y la vuelve a mandar más tarde, no la tira.
 *
 * Todo con la clave de servicio y SIEMPRE con `user_id` de la llave: las
 * claves compuestas de la base impiden colgar algo de una fila ajena aunque se
 * conozca su id.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type EstadoDeOp = "applied" | "duplicate" | "conflict" | "rejected";

export type MotivoRechazo =
  | "forma"
  | "datos"
  | "origen"
  | "cliente"
  | "no_existe"
  | "referencia"
  | "dato_privado"
  | "tope"
  | "no_disponible"
  | "error";

export interface ResultadoOp {
  op_id: string | null;
  estado: EstadoDeOp;
  motivo?: MotivoRechazo;
  /** El id de la fila (el de siempre, si ya existía por su clave externa). */
  id?: string;
  /** Lo que hay ahora, en un conflicto (las columnas de la lista del feed). */
  actual?: Record<string, unknown>;
  /** Campos que no se tocaron porque los escribió el dueño. */
  omitidos?: string[];
  version?: number;
}

export interface Contexto {
  admin: Admin;
  userId: string;
  cliente: ClientePuente;
  ahora: Date;
  zona: string;
}

/** Operaciones que no se apuntan en `puente_ops`: se repiten cada pocos minutos y son idempotentes. */
const SIN_REGISTRO: ReadonlySet<Operacion> = new Set(["metricas_del_dia", "agente_estado"]);

/** Lo que sólo puede mandar el bot (no Claude). */
const SOLO_MOTOR: ReadonlySet<Operacion> = new Set([
  "metricas_del_dia",
  "agente_estado",
  "persona_enlazar_wa",
  "recordatorio_copiado",
]);

/** Lo que el bot no puede pedir por su cuenta: sólo con el «sí» del dueño o desde Claude. */
const NUNCA_DEDUCIDO: ReadonlySet<Operacion> = new Set([
  "doc_guardar",
  "persona_enlazar_wa",
  "personas_unir",
  "tarea_reabrir",
  "proyecto_crear",
]);

/** Máximo de propuestas abiertas por proyecto: a partir de ahí, la app dice cuántas hay. */
export const PROPUESTAS_ABIERTAS_MAX = 10;

const ok = (op: OperacionValida, extra: Partial<ResultadoOp> = {}): ResultadoOp => ({
  op_id: op.op_id,
  estado: "applied",
  ...extra,
});
const no = (op: OperacionValida | null, motivo: MotivoRechazo, opId: string | null = null): ResultadoOp => ({
  op_id: op?.op_id ?? opId,
  estado: "rejected",
  motivo,
});
const choca = (op: OperacionValida, actual: Record<string, unknown>): ResultadoOp => ({
  op_id: op.op_id,
  estado: "conflict",
  actual,
  version: typeof actual.version === "number" ? actual.version : undefined,
});

/** El error de la base, en un motivo cerrado. */
function motivoDe(error: { code?: string } | null): MotivoRechazo {
  if (!error) return "error";
  if (error.code === "23503") return "referencia";
  if (error.code === "23514" || error.code === "22P02" || error.code === "22001") return "datos";
  // 42883 / PGRST202: la función todavía no existe (su migración no está aplicada).
  if (["42P01", "PGRST205", "42703", "42883", "PGRST202"].includes(error.code ?? "")) return "no_disponible";
  return "error";
}

/** ¿Puede este cliente, con este origen, pedir esta operación? */
function permitido(op: OperacionValida, cliente: ClientePuente): MotivoRechazo | null {
  const esClaude = cliente === "claude-1";
  if (esClaude && op.origin !== "claude") return "origen";
  if (!esClaude && op.origin === "claude") return "origen";
  if (esClaude && SOLO_MOTOR.has(op.kind)) return "cliente";
  if (op.origin === "bot" && NUNCA_DEDUCIDO.has(op.kind)) return "origen";
  if (op.kind === "tarea_reabrir" && op.origin !== "owner") return "origen";
  return null;
}

/** Aplica un lote. El orden importa (una persona antes que la tarea que la nombra). */
export async function aplicarLote(ctx: Contexto, crudas: unknown[]): Promise<ResultadoOp[]> {
  const resultados: ResultadoOp[] = [];
  for (const cruda of crudas) resultados.push(await aplicarUna(ctx, cruda));
  return resultados;
}

export async function aplicarUna(ctx: Contexto, cruda: unknown): Promise<ResultadoOp> {
  const v = validarOperacion(cruda);
  if (!v.ok) return no(null, v.motivo === "forma" ? "forma" : "datos", v.opId);
  const op = v.op;

  const prohibido = permitido(op, ctx.cliente);
  if (prohibido) return no(op, prohibido);
  if (llevaDatoPrivado(op.origin, op.data)) return no(op, "dato_privado");

  const registra = !SIN_REGISTRO.has(op.kind);
  if (registra) {
    const { data: previa } = await ctx.admin
      .from("puente_ops")
      .select("user_id, resultado")
      .eq("op_id", op.op_id)
      .maybeSingle();
    if (previa) {
      if (previa.user_id !== ctx.userId) return no(op, "datos");
      return { ...(previa.resultado as unknown as ResultadoOp), op_id: op.op_id, estado: "duplicate" };
    }
  }

  let resultado: ResultadoOp;
  try {
    resultado = await HACER[op.kind](ctx, op as never);
  } catch {
    resultado = no(op, "error");
  }

  // Se apunta lo que terminó: aplicado, rechazado de verdad o en conflicto. Un
  // «todavía no» o un fallo pasajero no, para que el reintento lo vuelva a probar.
  if (registra && resultado.motivo !== "no_disponible" && resultado.motivo !== "error") {
    await ctx.admin.from("puente_ops").upsert(
      {
        op_id: op.op_id,
        user_id: ctx.userId,
        cliente: ctx.cliente,
        kind: op.kind,
        resultado: resultado as unknown as Json,
      },
      { onConflict: "op_id", ignoreDuplicates: true },
    );
  }
  return resultado;
}

// --------------------------------------------------------------- ayudas

type ConOp<K extends Operacion> = Extract<OperacionValida, { kind: K }>;
type Hacer<K extends Operacion> = (ctx: Contexto, op: ConOp<K>) => Promise<ResultadoOp>;

const enDias = (ahora: Date, dias: number) => new Date(ahora.getTime() + dias * 86_400_000).toISOString();

/** Lo que dice una fila ahora, para devolverlo en un conflicto (nunca más que esto). */
function foto(fila: Record<string, unknown>, columnas: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(columnas.filter((c) => c in fila).map((c) => [c, fila[c]]));
}

/** `base_version` dice qué versión vio el bot. Si la fila ya va por otra, es un conflicto. */
function cambioDesdeLoVisto(op: OperacionValida, version: unknown): boolean {
  return op.base_version !== undefined && typeof version === "number" && version !== op.base_version;
}

/** El resultado de cambiar campos: aplicado (con lo omitido) o nada que cambiar. */
function cambiado(op: OperacionValida, omitidos: string[], version?: number): ResultadoOp {
  return ok(op, { ...(omitidos.length ? { omitidos } : {}), ...(version !== undefined ? { version } : {}) });
}

// --------------------------------------------------------------- proyectos

const COLUMNAS_PROYECTO = [
  "id", "name", "aliases", "status", "health", "health_until", "objective", "how_md", "started_on", "target_on",
  "version", "field_src",
] as const;

const proyectoCrear: Hacer<"proyecto_crear"> = async (ctx, op) => {
  const d = op.data;
  const { data: existentes } = await ctx.admin.from("tasks_projects").select("id, name, slug").eq("user_id", ctx.userId);
  const lista = existentes ?? [];
  if (lista.some((p) => p.id === d.id)) return ok(op, { id: d.id });
  const mismoNombre = lista.find((p) => p.name.trim().toLowerCase() === d.nombre.trim().toLowerCase());
  if (mismoNombre) return choca(op, { id: mismoNombre.id, name: mismoNombre.name, slug: mismoNombre.slug });

  const ocupados = lista.map((p) => p.slug).filter((s): s is string => !!s);
  const slug = d.slug && !ocupados.includes(d.slug) ? d.slug : freeSlug(d.slug ?? d.nombre, ocupados);
  const campos = {
    name: d.nombre,
    aliases: d.alias ?? [],
    status: d.estado ?? "EN_MARCHA",
    objective: d.objetivo ?? null,
    how_md: d.como_va ?? null,
    started_on: d.inicio ?? null,
    target_on: d.meta ?? null,
  };
  const { error } = await ctx.admin.from("tasks_projects").insert({
    id: d.id,
    user_id: ctx.userId,
    ...campos,
    slug,
    color: d.color ?? colorForName(d.nombre),
    ...(d.como_va ? { how_at: ctx.ahora.toISOString(), how_by: hechoPor(op.origin) } : {}),
    field_src: marcaNueva(op.origin, campos),
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      const { data: mismo } = await ctx.admin
        .from("tasks_projects")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("id", d.id)
        .maybeSingle();
      if (mismo) return ok(op, { id: d.id });
      if (d.ext_source && d.ext_id) {
        const { data: porExt } = await ctx.admin
          .from("tasks_projects")
          .select("id")
          .eq("user_id", ctx.userId)
          .eq("ext_source", d.ext_source)
          .eq("ext_id", d.ext_id)
          .maybeSingle();
        if (porExt) return ok(op, { id: porExt.id });
      }
    }
    return no(op, motivoDe(error));
  }
  return ok(op, { id: d.id });
};

const proyectoCambiar: Hacer<"proyecto_cambiar"> = async (ctx, op) => {
  const { id, campos } = op.data;
  const { data: fila } = await ctx.admin
    .from("tasks_projects")
    .select(COLUMNAS_PROYECTO.join(", "))
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!fila) return no(op, "no_existe");
  const actual = fila as unknown as Record<string, unknown>;
  if (cambioDesdeLoVisto(op, actual.version)) return choca(op, foto(actual, COLUMNAS_PROYECTO.filter((c) => c !== "field_src")));

  const cambios: Record<string, unknown> = {
    name: campos.nombre,
    aliases: campos.alias,
    status: campos.estado,
    health: campos.salud,
    objective: campos.objetivo,
    how_md: campos.como_va,
    started_on: campos.inicio,
    target_on: campos.meta,
  };
  if (campos.nombre !== undefined) {
    const alias = aliasConNombreDeAntes(String(actual.name ?? ""), (actual.aliases as string[]) ?? [], campos.nombre);
    if (alias && campos.alias === undefined) cambios.aliases = alias;
  }
  const { parche, src, omitidos } = fusionar(op.origin, actual, actual.field_src as FieldSrc, cambios);
  if (Object.keys(parche).length === 0) return cambiado(op, omitidos, actual.version as number);

  const extra: Record<string, unknown> = {};
  if ("health" in parche) extra.health_until = parche.health ? enDias(ctx.ahora, 14) : null;
  if ("how_md" in parche) {
    extra.how_at = ctx.ahora.toISOString();
    extra.how_by = hechoPor(op.origin);
  }
  const cambiaEstado = "status" in parche && parche.status !== actual.status;
  if (cambiaEstado) {
    extra.closed_on = parche.status === "TERMINADO" || parche.status === "DESCARTADO" ? todayIn(ctx.zona, ctx.ahora) : null;
  }

  const { data: nueva, error } = await ctx.admin
    .from("tasks_projects")
    .update({ ...parche, ...extra, field_src: src })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("version")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return choca(op, foto(actual, ["id", "name", "version"]));
    return no(op, motivoDe(error));
  }
  if (cambiaEstado) {
    await ctx.admin.from("tasks_project_log").insert({
      user_id: ctx.userId,
      project_id: id,
      kind: "ESTADO",
      title: `Pasó de «${PROJECT_STATUS_LABELS[actual.status as ProjectStatus]}» a «${PROJECT_STATUS_LABELS[parche.status as ProjectStatus]}»`.slice(
        0,
        PROJECT_LIMITS.logTitle,
      ),
      auto: true,
      origin: origenEnLaBase(op.origin),
    });
  }
  return cambiado(op, omitidos, nueva?.version);
};

const docGuardar: Hacer<"doc_guardar"> = async (ctx, op) => {
  const d = op.data;
  const { data: proyecto } = await ctx.admin
    .from("tasks_projects")
    .select("id")
    .eq("id", d.proyecto_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!proyecto) return no(op, "no_existe");
  const { data: ficha } = await ctx.admin
    .from("tasks_project_docs")
    .select("id, made_by, version")
    .eq("user_id", ctx.userId)
    .eq("project_id", d.proyecto_id)
    .eq("kind", "FICHA")
    .maybeSingle();
  const madeBy = op.origin === "owner" && d.autor === "BOT" ? "BOT" : hechoPor(op.origin);
  if (ficha) {
    if (cambioDesdeLoVisto(op, ficha.version)) return choca(op, { id: ficha.id, made_by: ficha.made_by, version: ficha.version });
    // Claude no pisa una ficha que escribió el dueño en la app.
    if (op.origin === "claude" && ficha.made_by === "OWNER") return ok(op, { id: ficha.id, omitidos: ["body_md"] });
    const { error } = await ctx.admin
      .from("tasks_project_docs")
      .update({ body_md: d.cuerpo, made_by: madeBy })
      .eq("id", ficha.id)
      .eq("user_id", ctx.userId);
    return error ? no(op, motivoDe(error)) : ok(op, { id: ficha.id });
  }
  const { data: nueva, error } = await ctx.admin
    .from("tasks_project_docs")
    .insert({
      user_id: ctx.userId,
      project_id: d.proyecto_id,
      kind: "FICHA",
      title: "Ficha técnica",
      body_md: d.cuerpo,
      made_by: madeBy,
    })
    .select("id")
    .single();
  return error ? no(op, motivoDe(error)) : ok(op, { id: nueva.id });
};

// ---------------------------------------------------------------- personas

const COLUMNAS_PERSONA = [
  "id", "name", "aliases", "relation", "org", "circle", "whatsapp_hint", "has_whatsapp", "version", "field_src",
] as const;

const personaCrear: Hacer<"persona_crear"> = async (ctx, op) => {
  const d = op.data;
  const campos = {
    name: d.nombre,
    aliases: d.alias ?? [],
    relation: d.relacion ?? null,
    org: d.org ?? null,
    circle: d.circulo ?? null,
    whatsapp_hint: d.whatsapp ?? null,
  };
  const { error } = await ctx.admin.from("core_people").insert({
    id: d.id,
    user_id: ctx.userId,
    ...campos,
    field_src: marcaNueva(op.origin, campos),
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
  });
  if (!error) return ok(op, { id: d.id });
  if (error.code === "23505") {
    const { data: mismo } = await ctx.admin.from("core_people").select("id").eq("id", d.id).eq("user_id", ctx.userId).maybeSingle();
    if (mismo) return ok(op, { id: d.id });
    if (d.ext_source && d.ext_id) {
      const { data: porExt } = await ctx.admin
        .from("core_people")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("ext_source", d.ext_source)
        .eq("ext_id", d.ext_id)
        .maybeSingle();
      if (porExt) return ok(op, { id: porExt.id });
    }
  }
  return no(op, motivoDe(error));
};

const personaCambiar: Hacer<"persona_cambiar"> = async (ctx, op) => {
  const { id, campos } = op.data;
  const { data: fila } = await ctx.admin
    .from("core_people")
    .select(COLUMNAS_PERSONA.join(", "))
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!fila) return no(op, "no_existe");
  const actual = fila as unknown as Record<string, unknown>;
  if (cambioDesdeLoVisto(op, actual.version)) return choca(op, foto(actual, COLUMNAS_PERSONA.filter((c) => c !== "field_src")));
  const cambios: Record<string, unknown> = {
    name: campos.nombre,
    aliases: campos.alias,
    relation: campos.relacion,
    org: campos.org,
    circle: campos.circulo,
    whatsapp_hint: campos.whatsapp,
  };
  if (campos.nombre !== undefined && campos.alias === undefined) {
    const alias = aliasConNombreDeAntes(String(actual.name ?? ""), (actual.aliases as string[]) ?? [], campos.nombre);
    if (alias) cambios.aliases = alias;
  }
  const { parche, src, omitidos } = fusionar(op.origin, actual, actual.field_src as FieldSrc, cambios);
  if (Object.keys(parche).length === 0) return cambiado(op, omitidos, actual.version as number);
  const { data: nueva, error } = await ctx.admin
    .from("core_people")
    .update({ ...parche, field_src: src })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("version")
    .maybeSingle();
  return error ? no(op, motivoDe(error)) : cambiado(op, omitidos, nueva?.version);
};

const personaEnlazarWa: Hacer<"persona_enlazar_wa"> = async (ctx, op) => {
  const { id, enlazada } = op.data;
  const { data: fila } = await ctx.admin
    .from("core_people")
    .select("id, whatsapp_hint, version")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!fila) return no(op, "no_existe");
  const { error } = await ctx.admin
    .from("core_people")
    .update({
      has_whatsapp: enlazada,
      ...(enlazada && !fila.whatsapp_hint ? { whatsapp_hint: "SI" as const } : {}),
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  return error ? no(op, motivoDe(error)) : ok(op, { id });
};

/** Unir dos personas mueve tareas, papeles y fuentes: llega con las órdenes (E5). Hasta entonces, espera. */
const personasUnir: Hacer<"personas_unir"> = async (_ctx, op) => no(op, "no_disponible");

// ---------------------------------------------------------------- miembros

const miembroPoner: Hacer<"miembro_poner"> = async (ctx, op) => {
  const d = op.data;
  const { data: fila } = await ctx.admin
    .from("tasks_project_members")
    .select("id, role, does_md, side, is_lead, active, field_src, version")
    .eq("user_id", ctx.userId)
    .eq("project_id", d.proyecto_id)
    .eq("person_id", d.persona_id)
    .maybeSingle();
  const cambios = { role: d.papel, does_md: d.hace, side: d.lado, is_lead: d.lider };
  if (!fila) {
    const limpios = Object.fromEntries(Object.entries(cambios).filter(([, v]) => v !== undefined));
    const { error } = await ctx.admin.from("tasks_project_members").insert({
      id: d.id,
      user_id: ctx.userId,
      project_id: d.proyecto_id,
      person_id: d.persona_id,
      ...limpios,
      field_src: marcaNueva(op.origin, limpios),
    });
    if (error?.code === "23505") return ok(op, { id: d.id });
    return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
  }
  const actual = fila as unknown as Record<string, unknown>;
  const { parche, src, omitidos } = fusionar(op.origin, actual, actual.field_src as FieldSrc, cambios);
  const { error } = await ctx.admin
    .from("tasks_project_members")
    .update({ ...parche, active: true, field_src: src })
    .eq("id", fila.id)
    .eq("user_id", ctx.userId);
  return error ? no(op, motivoDe(error)) : ok(op, { id: fila.id, ...(omitidos.length ? { omitidos } : {}) });
};

const miembroQuitar: Hacer<"miembro_quitar"> = async (ctx, op) => {
  const d = op.data;
  const { error } = await ctx.admin
    .from("tasks_project_members")
    .update({ active: false })
    .eq("user_id", ctx.userId)
    .eq("project_id", d.proyecto_id)
    .eq("person_id", d.persona_id);
  return error ? no(op, motivoDe(error)) : ok(op);
};

// ----------------------------------------------------------------- trabajo

const frenteCrear: Hacer<"frente_crear"> = async (ctx, op) => {
  const d = op.data;
  const { error } = await ctx.admin.from("tasks_streams").insert({
    id: d.id,
    user_id: ctx.userId,
    project_id: d.proyecto_id,
    name: d.nombre,
    lead_person_id: d.responsable_id ?? null,
    field_src: marcaNueva(op.origin, { name: d.nombre, lead_person_id: d.responsable_id }),
  });
  if (error?.code === "23505") {
    const { data: mismo } = await ctx.admin
      .from("tasks_streams")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("project_id", d.proyecto_id)
      .eq("name", d.nombre)
      .maybeSingle();
    return ok(op, { id: mismo?.id ?? d.id });
  }
  return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
};

const COLUMNAS_HITO = [
  "id", "kind", "title", "due_on", "due_precision", "status", "blocked_why", "owner_person_id", "former_titles",
  "version", "field_src",
] as const;

const hitoCrear: Hacer<"hito_crear"> = async (ctx, op) => {
  const d = op.data;
  const campos = {
    title: d.titulo,
    starts_on: d.inicio ?? null,
    due_on: d.fecha ?? null,
    owner_person_id: d.responsable_id ?? null,
  };
  const { error } = await ctx.admin.from("tasks_milestones").insert({
    id: d.id,
    user_id: ctx.userId,
    project_id: d.proyecto_id,
    kind: d.tipo,
    stage_id: d.tipo === "HITO" ? (d.etapa_id ?? null) : null,
    ...campos,
    due_precision: d.precision ?? "DIA",
    field_src: marcaNueva(op.origin, campos),
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
  });
  if (error?.code === "23505") return ok(op, { id: d.id });
  return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
};

const hitoCambiar: Hacer<"hito_cambiar"> = async (ctx, op) => {
  const { id, campos } = op.data;
  const { data: fila } = await ctx.admin
    .from("tasks_milestones")
    .select(COLUMNAS_HITO.join(", "))
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!fila) return no(op, "no_existe");
  const actual = fila as unknown as Record<string, unknown>;
  if (cambioDesdeLoVisto(op, actual.version)) return choca(op, foto(actual, COLUMNAS_HITO.filter((c) => c !== "field_src")));
  // Lo cumplido no lo reabre nadie más que el dueño.
  if (campos.estado && actual.status === "HECHO" && campos.estado !== "HECHO" && op.origin !== "owner") {
    return no(op, "origen");
  }
  const cambios: Record<string, unknown> = {
    title: campos.titulo,
    due_on: campos.fecha,
    due_precision: campos.precision,
    status: campos.estado,
    blocked_why: campos.bloqueo,
    owner_person_id: campos.responsable_id,
  };
  const { parche, src, omitidos } = fusionar(op.origin, actual, actual.field_src as FieldSrc, cambios);
  if (Object.keys(parche).length === 0) return cambiado(op, omitidos, actual.version as number);
  const extra: Record<string, unknown> = {};
  if ("status" in parche) extra.done_at = parche.status === "HECHO" ? ctx.ahora.toISOString() : null;
  if (typeof parche.title === "string") {
    const antes = titulosDeAntes(String(actual.title), (actual.former_titles as string[]) ?? [], parche.title);
    if (antes) extra.former_titles = antes;
  }
  const { data: nueva, error } = await ctx.admin
    .from("tasks_milestones")
    .update({ ...parche, ...extra, field_src: src })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("version")
    .maybeSingle();
  return error ? no(op, motivoDe(error)) : cambiado(op, omitidos, nueva?.version);
};

const COLUMNAS_TAREA = [
  "id", "title", "status", "due_date", "assignee_id", "project_id", "stream_id", "milestone_id", "priority",
  "former_titles", "version", "field_src",
] as const;

const tareaCrear: Hacer<"tarea_crear"> = async (ctx, op) => {
  const d = op.data;
  const campos = {
    title: d.titulo,
    project_id: d.proyecto_id ?? null,
    assignee_id: d.responsable_id ?? null,
    stream_id: d.frente_id ?? null,
    milestone_id: d.hito_id ?? null,
    due_date: d.fecha ?? null,
    priority: d.prioridad ?? "MEDIA",
  };
  const ahora = ctx.ahora.toISOString();
  const { error } = await ctx.admin.from("tasks_items").insert({
    id: d.id,
    user_id: ctx.userId,
    ...campos,
    with_ids: d.con_ids ?? [],
    parent_id: d.madre_id ?? null,
    origin: origenEnLaBase(op.origin, { via: d.via, fuente: d.fuente }),
    source_kind: d.fuente?.tipo ?? null,
    source_ref: d.fuente?.ref ?? null,
    source_label: d.fuente?.etiqueta ?? null,
    source_at: d.fuente?.en ?? null,
    field_src: marcaNueva(op.origin, campos),
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
    updated_at: ahora,
  });
  if (!error) return ok(op, { id: d.id });
  if (error.code === "23505") {
    const { data: mismo } = await ctx.admin.from("tasks_items").select("id").eq("id", d.id).eq("user_id", ctx.userId).maybeSingle();
    if (mismo) return ok(op, { id: d.id });
    if (d.ext_source && d.ext_id) {
      const { data: porExt } = await ctx.admin
        .from("tasks_items")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("ext_source", d.ext_source)
        .eq("ext_id", d.ext_id)
        .maybeSingle();
      if (porExt) return ok(op, { id: porExt.id });
    }
  }
  return no(op, motivoDe(error));
};

const tareaCambiar: Hacer<"tarea_cambiar"> = async (ctx, op) => {
  const { id, campos } = op.data;
  const { data: fila } = await ctx.admin
    .from("tasks_items")
    .select(COLUMNAS_TAREA.join(", "))
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!fila) return no(op, "no_existe");
  const actual = fila as unknown as Record<string, unknown>;
  if (cambioDesdeLoVisto(op, actual.version)) return choca(op, foto(actual, COLUMNAS_TAREA.filter((c) => c !== "field_src")));
  // Terminar es definitivo: cambiar no reabre (para eso, `tarea_reabrir`).
  if (campos.estado && actual.status === "HECHA") return choca(op, foto(actual, COLUMNAS_TAREA.filter((c) => c !== "field_src")));
  const cambios: Record<string, unknown> = {
    title: campos.titulo,
    due_date: campos.fecha,
    assignee_id: campos.responsable_id,
    project_id: campos.proyecto_id,
    stream_id: campos.frente_id,
    milestone_id: campos.hito_id,
    priority: campos.prioridad,
    status: campos.estado,
  };
  const { parche, src, omitidos } = fusionar(op.origin, actual, actual.field_src as FieldSrc, cambios);
  if (Object.keys(parche).length === 0) return cambiado(op, omitidos, actual.version as number);
  const extra: Record<string, unknown> = { updated_at: ctx.ahora.toISOString() };
  if (typeof parche.title === "string") {
    const antes = titulosDeAntes(String(actual.title), (actual.former_titles as string[]) ?? [], parche.title);
    if (antes) extra.former_titles = antes;
  }
  const { data: nueva, error } = await ctx.admin
    .from("tasks_items")
    .update({ ...parche, ...extra, field_src: src })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("version")
    .maybeSingle();
  return error ? no(op, motivoDe(error)) : cambiado(op, omitidos, nueva?.version);
};

const tareaHecha: Hacer<"tarea_hecha"> = async (ctx, op) => {
  const { id } = op.data;
  const { data: fila } = await ctx.admin.from("tasks_items").select("id, status").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
  if (!fila) return no(op, "no_existe");
  if (fila.status === "HECHA") return ok(op, { id });
  const ahora = ctx.ahora.toISOString();
  const { error } = await ctx.admin
    .from("tasks_items")
    .update({ status: "HECHA", completed_at: ahora, updated_at: ahora })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  return error ? no(op, motivoDe(error)) : ok(op, { id });
};

const tareaReabrir: Hacer<"tarea_reabrir"> = async (ctx, op) => {
  const { id } = op.data;
  const { data: fila } = await ctx.admin.from("tasks_items").select("id, status").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
  if (!fila) return no(op, "no_existe");
  if (fila.status !== "HECHA") return ok(op, { id });
  const { error } = await ctx.admin
    .from("tasks_items")
    .update({ status: "NO_INICIADA", completed_at: null, updated_at: ctx.ahora.toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  return error ? no(op, motivoDe(error)) : ok(op, { id });
};

// ----------------------------------------------------------------- avances

const bitacoraNota: Hacer<"bitacora_nota"> = async (ctx, op) => {
  const d = op.data;
  const { error } = await ctx.admin.from("tasks_project_log").insert({
    id: d.id,
    user_id: ctx.userId,
    project_id: d.proyecto_id,
    at: d.en ?? ctx.ahora.toISOString(),
    kind: d.tipo,
    title: d.titulo,
    body: d.texto ?? null,
    person_ids: d.persona_ids ?? [],
    source_kind: d.fuente?.tipo ?? null,
    source_ref: d.fuente?.ref ?? null,
    source_label: d.fuente?.etiqueta ?? null,
    origin: origenEnLaBase(op.origin, { fuente: d.fuente }),
    auto: false,
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
  });
  if (error?.code === "23505") return ok(op, { id: d.id });
  return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
};

const fuentePoner: Hacer<"fuente_poner"> = async (ctx, op) => {
  const d = op.data;
  const { error } = await ctx.admin.from("tasks_project_sources").insert({
    id: d.id,
    user_id: ctx.userId,
    project_id: d.proyecto_id,
    kind: d.tipo,
    label: d.etiqueta,
    ref: d.ref ?? null,
    // Lo que manda el bot vive en la Mac: aquí sólo el hecho.
    lives: "MAC",
    person_ids: d.persona_ids ?? [],
    at: d.en ?? null,
    duration_sec: d.duracion_s ?? null,
    confirmed: d.confirmada ?? op.origin !== "bot",
    origin: origenEnLaBase(op.origin, { fuente: d.tipo === "LLAMADA" || d.tipo === "REUNION" ? { tipo: d.tipo } : null }),
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
  });
  if (error?.code === "23505") return ok(op, { id: d.id });
  return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
};

const fuenteQuitar: Hacer<"fuente_quitar"> = async (ctx, op) => {
  const { error } = await ctx.admin.from("tasks_project_sources").delete().eq("id", op.data.id).eq("user_id", ctx.userId);
  return error ? no(op, motivoDe(error)) : ok(op, { id: op.data.id });
};

/**
 * Se borró en la Mac (una reunión, una llamada). Se va lo que colgaba de esa
 * referencia: la fuente, las propuestas sin decidir y las entradas de bitácora
 * que la citaban. Las tareas que aceptaste se quedan, pero sin el enlace a una
 * evidencia que ya no existe.
 */
const fuenteBorrada: Hacer<"fuente_borrada"> = async (ctx, op) => {
  const { ref } = op.data;
  const pasos = await Promise.all([
    ctx.admin.from("tasks_project_sources").delete().eq("user_id", ctx.userId).eq("ref", ref),
    ctx.admin.from("core_inbox").delete().eq("user_id", ctx.userId).eq("source_ref", ref).eq("status", "ABIERTA"),
    ctx.admin.from("tasks_project_log").delete().eq("user_id", ctx.userId).eq("source_ref", ref),
    ctx.admin
      .from("tasks_items")
      .update({ source_ref: null, source_label: null, updated_at: ctx.ahora.toISOString() })
      .eq("user_id", ctx.userId)
      .eq("source_ref", ref),
  ]);
  const fallo = pasos.find((p) => p.error)?.error ?? null;
  return fallo ? no(op, motivoDe(fallo)) : ok(op);
};

// ----------------------------------------------------------- recordatorios

/**
 * Los recordatorios llegan con su propia migración (E2). Hasta que exista la
 * tabla, cualquier operación de recordatorio vuelve `no_disponible` y el bot
 * la guarda. Crear y cambiar hablan con la tabla sin tipo, en una sola función
 * (así el puente no depende de los tipos de E2); «hecho» y «en 1 h» van por las
 * funciones de la base.
 */
interface SinTipo {
  from: (tabla: string) => {
    insert: (fila: unknown) => PromiseLike<{ error: { code?: string } | null }>;
    update: (cambios: unknown) => {
      eq: (c: string, v: unknown) => {
        eq: (c: string, v: unknown) => PromiseLike<{ error: { code?: string } | null }>;
      };
    };
  };
}

function sinTipo(admin: Admin): SinTipo {
  return admin as unknown as SinTipo;
}

const recordatorioCrear: Hacer<"recordatorio_crear"> = async (ctx, op) => {
  const d = op.data;
  const { error } = await sinTipo(ctx.admin).from("core_reminders").insert({
    id: d.id,
    user_id: ctx.userId,
    text: d.texto,
    kind: d.tipo ?? "TEXTO",
    entity_kind: d.entidad?.tipo === "PROYECTO" ? "PROYECTO" : d.entidad?.tipo === "TAREA" ? "TAREA" : d.entidad ? "PERSONA" : null,
    entity_id: d.entidad?.id ?? null,
    freq: d.frecuencia,
    every_n: d.cada_n ?? null,
    at_time: d.hora,
    days: d.dias ?? [],
    monthday: d.dia_del_mes ?? null,
    on_date: d.el_dia ?? null,
    until_date: d.hasta ?? null,
    tz: ctx.zona,
    origin: origenEnLaBase(op.origin),
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
  });
  if (error?.code === "23505") return ok(op, { id: d.id });
  return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
};

const recordatorioCambiar: Hacer<"recordatorio_cambiar"> = async (ctx, op) => {
  const { id, campos } = op.data;
  const cambios = Object.fromEntries(
    Object.entries({ text: campos.texto, at_time: campos.hora, active: campos.activo }).filter(([, v]) => v !== undefined),
  );
  const { error } = await sinTipo(ctx.admin).from("core_reminders").update(cambios).eq("id", id).eq("user_id", ctx.userId);
  return error ? no(op, motivoDe(error)) : ok(op, { id });
};

/**
 * «hecho» y «en 1 h» hacen lo mismo que los botones del push (cerrar o
 * posponer el disparo, que vuelva a sonar a esa hora y apagar la campana): lo
 * hace la base, con las gemelas para el rol de servicio
 * (`20261007130000_el_puente_y_los_recordatorios.sql`).
 */
const recordatorioHecho: Hacer<"recordatorio_hecho"> = async (ctx, op) => {
  const { data, error } = await ctx.admin.rpc("recordatorio_hecho_puente", {
    p_user: ctx.userId,
    p_reminder: op.data.id,
    p_fire_at: op.data.disparo,
  });
  if (error) return no(op, motivoDe(error));
  return data ? ok(op, { id: op.data.id }) : no(op, "no_existe");
};

const recordatorioPosponer: Hacer<"recordatorio_posponer"> = async (ctx, op) => {
  const { data, error } = await ctx.admin.rpc("recordatorio_posponer_puente", {
    p_user: ctx.userId,
    p_reminder: op.data.id,
    p_fire_at: op.data.disparo,
    p_hasta: op.data.hasta,
  });
  if (error) return no(op, motivoDe(error));
  return data ? ok(op, { id: op.data.id }) : no(op, "no_existe");
};

const recordatorioCopiado: Hacer<"recordatorio_copiado"> = async (ctx, op) => {
  const { error } = await sinTipo(ctx.admin)
    .from("core_reminder_fires")
    .update({ wa_copied_at: ctx.ahora.toISOString() })
    .eq("reminder_id", op.data.id)
    .eq("fire_at", op.data.disparo);
  return error ? no(op, motivoDe(error)) : ok(op, { id: op.data.id });
};

// --------------------------------------------------------------- propuestas

const COLUMNAS_PROPUESTA = ["id", "kind", "project_id", "title", "status", "decided_at", "decided_via", "version"] as const;

const propuestaCrear: Hacer<"propuesta_crear"> = async (ctx, op) => {
  const d = op.data;
  if (d.ext_source && d.ext_id) {
    // Lo que ya se propuso (y quizá se descartó) no vuelve.
    const { data: previa } = await ctx.admin
      .from("core_inbox")
      .select("id, status")
      .eq("user_id", ctx.userId)
      .eq("ext_source", d.ext_source)
      .eq("ext_id", d.ext_id)
      .maybeSingle();
    if (previa) return ok(op, { id: previa.id });
  }
  if (d.proyecto_id) {
    const { count } = await ctx.admin
      .from("core_inbox")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("project_id", d.proyecto_id)
      .eq("status", "ABIERTA");
    if ((count ?? 0) >= PROPUESTAS_ABIERTAS_MAX) return no(op, "tope");
  }
  const { error } = await ctx.admin.from("core_inbox").insert({
    id: d.id,
    user_id: ctx.userId,
    kind: d.tipo,
    project_id: d.proyecto_id ?? null,
    alt_project_ids: d.otros_proyectos ?? [],
    title: d.titulo,
    payload: (d.datos ?? {}) as Json,
    confidence: d.confianza,
    why: d.porque ?? null,
    source_kind: d.fuente?.tipo ?? null,
    source_ref: d.fuente?.ref ?? null,
    source_label: d.fuente?.etiqueta ?? null,
    source_at: d.fuente?.en ?? null,
    ext_source: d.ext_source ?? null,
    ext_id: d.ext_id ?? null,
  });
  if (error?.code === "23505") return ok(op, { id: d.id });
  return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
};

const propuestaRetirar: Hacer<"propuesta_retirar"> = async (ctx, op) => {
  const { error } = await ctx.admin
    .from("core_inbox")
    .delete()
    .eq("id", op.data.id)
    .eq("user_id", ctx.userId)
    .eq("status", "ABIERTA");
  return error ? no(op, motivoDe(error)) : ok(op, { id: op.data.id });
};

const propuestaDecidir: Hacer<"propuesta_decidir"> = async (ctx, op) => {
  const d = op.data;
  const { data: fila } = await ctx.admin
    .from("core_inbox")
    .select(COLUMNAS_PROPUESTA.join(", "))
    .eq("id", d.id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!fila) return no(op, "no_existe");
  const actual = fila as unknown as Record<string, unknown>;
  // Contestar en un sitio la cierra en el otro: si ya se decidió, se dice.
  if (actual.status !== "ABIERTA") {
    return actual.status === d.decision ? ok(op, { id: d.id }) : choca(op, actual);
  }
  const { error } = await ctx.admin
    .from("core_inbox")
    .update({
      status: d.decision,
      decided_at: ctx.ahora.toISOString(),
      decided_via: d.via,
      dismiss_reason: d.decision === "DESCARTADA" ? (d.motivo ?? "OTRO") : null,
      result_kind: d.resultado?.tipo ?? null,
      result_id: d.resultado?.id ?? null,
    })
    .eq("id", d.id)
    .eq("user_id", ctx.userId)
    .eq("status", "ABIERTA");
  return error ? no(op, motivoDe(error)) : ok(op, { id: d.id });
};

// ------------------------------------------------------ estado del motor

const metricasDelDia: Hacer<"metricas_del_dia"> = async (ctx, op) => {
  const d = op.data;
  const filas = Object.entries(d.cifras).map(([clave, valor]) => ({
    user_id: ctx.userId,
    metric_date: d.fecha,
    module: "whatsapp",
    metric_key: clave,
    value: valor as number,
    unit: null,
    updated_at: ctx.ahora.toISOString(),
  }));
  if (filas.length === 0) return ok(op);
  const { error } = await ctx.admin
    .from("core_daily_metrics")
    .upsert(filas, { onConflict: "user_id,metric_date,module,metric_key" });
  return error ? no(op, motivoDe(error)) : ok(op);
};

/** Dos arranques que van y vuelven en menos de esto: dos procesos con la misma llave. */
const VAIVEN_MS = 10 * 60_000;

const agenteEstado: Hacer<"agente_estado"> = async (ctx, op) => {
  const d = op.data;
  const { data: fila } = await ctx.admin
    .from("puente_clientes")
    .select("boot_id, boot_anterior, boot_cambio_en, dos_motores_en")
    .eq("user_id", ctx.userId)
    .eq("cliente", ctx.cliente)
    .maybeSingle();
  const ahora = ctx.ahora.toISOString();
  const arranque: Record<string, unknown> = {};
  if (fila?.boot_id && fila.boot_id !== d.boot_id) {
    const cambioReciente =
      !!fila.boot_cambio_en && ctx.ahora.getTime() - Date.parse(fila.boot_cambio_en) < VAIVEN_MS;
    if (fila.boot_anterior === d.boot_id && cambioReciente) arranque.dos_motores_en = ahora;
    arranque.boot_anterior = fila.boot_id;
    arranque.boot_cambio_en = ahora;
  }
  const { error } = await ctx.admin.from("puente_clientes").upsert(
    {
      user_id: ctx.userId,
      cliente: ctx.cliente,
      visto_en: ahora,
      estado_en: ahora,
      boot_id: d.boot_id,
      ...arranque,
      version: d.version,
      panel_url: d.panel_url,
      wa_conectado: d.wa_conectado,
      donde: d.donde,
    },
    { onConflict: "user_id,cliente" },
  );
  return error ? no(op, motivoDe(error)) : ok(op);
};

const HACER: { [K in Operacion]: Hacer<K> } = {
  proyecto_crear: proyectoCrear,
  proyecto_cambiar: proyectoCambiar,
  doc_guardar: docGuardar,
  persona_crear: personaCrear,
  persona_cambiar: personaCambiar,
  persona_enlazar_wa: personaEnlazarWa,
  personas_unir: personasUnir,
  miembro_poner: miembroPoner,
  miembro_quitar: miembroQuitar,
  frente_crear: frenteCrear,
  hito_crear: hitoCrear,
  hito_cambiar: hitoCambiar,
  tarea_crear: tareaCrear,
  tarea_cambiar: tareaCambiar,
  tarea_hecha: tareaHecha,
  tarea_reabrir: tareaReabrir,
  bitacora_nota: bitacoraNota,
  fuente_poner: fuentePoner,
  fuente_quitar: fuenteQuitar,
  fuente_borrada: fuenteBorrada,
  recordatorio_crear: recordatorioCrear,
  recordatorio_cambiar: recordatorioCambiar,
  recordatorio_hecho: recordatorioHecho,
  recordatorio_posponer: recordatorioPosponer,
  recordatorio_copiado: recordatorioCopiado,
  propuesta_crear: propuestaCrear,
  propuesta_retirar: propuestaRetirar,
  propuesta_decidir: propuestaDecidir,
  metricas_del_dia: metricasDelDia,
  agente_estado: agenteEstado,
};

export type { DatosDe, Origen };
