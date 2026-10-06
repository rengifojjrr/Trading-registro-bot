import { z } from "zod";

import { PROJECT_LIMITS, PROJECT_NAME_MAX } from "@/modules/tasks/domain/projects";

/**
 * Las operaciones del puente: una lista cerrada, cada una con su forma exacta.
 *
 * Todas son `.strict()`: un campo de más se rechaza, no se ignora. Los topes
 * de largo son los de la base (sin repetir el 120 contra 60 de antes). El bot
 * tiene la misma lista en `wa-core/src/puente/ops.js`.
 *
 * Cada operación viaja dentro de un sobre: `{v, op_id, kind, at, origin,
 * base_version?, data}`. `op_id` nace en el bot (UUIDv7) y no cambia en los
 * reintentos. `origin` dice quién la pide:
 *
 * - `owner`: lo dijo el dueño (por WhatsApp o por voz). Manda como lo que
 *   escribe en la app.
 * - `claude`: Claude Code en la Mac, con el archivo del proyecto.
 * - `bot`: lo dedujo el bot (de un chat, una reunión, una llamada). Nunca pisa
 *   un campo que escribió el dueño y sus textos pasan un control más.
 */

export const OPERACIONES = [
  "proyecto_crear",
  "proyecto_cambiar",
  "doc_guardar",
  "persona_crear",
  "persona_cambiar",
  "persona_enlazar_wa",
  "personas_unir",
  "miembro_poner",
  "miembro_quitar",
  "frente_crear",
  "hito_crear",
  "hito_cambiar",
  "tarea_crear",
  "tarea_cambiar",
  "tarea_hecha",
  "tarea_reabrir",
  "bitacora_nota",
  "fuente_poner",
  "fuente_quitar",
  "fuente_borrada",
  "recordatorio_crear",
  "recordatorio_cambiar",
  "recordatorio_hecho",
  "recordatorio_posponer",
  "recordatorio_copiado",
  "propuesta_crear",
  "propuesta_retirar",
  "propuesta_decidir",
  "metricas_del_dia",
  "agente_estado",
] as const;

export type Operacion = (typeof OPERACIONES)[number];

export const ORIGENES = ["owner", "claude", "bot"] as const;
export type Origen = (typeof ORIGENES)[number];

/** Como mucho tantas operaciones por petición. */
export const OPS_POR_LOTE = 50;

const id = z.uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instante = z.iso.datetime({ offset: true });
const texto = (max: number) => z.string().trim().min(1).max(max);
const textoONulo = (max: number) => z.string().trim().max(max).nullable();
const alias = z.array(z.string().trim().min(1).max(60)).max(20);
/** Referencia opaca a la evidencia que vive en la Mac: `mt:<uid>:<n>`, `bp:<id>`, `call:<hmac>`, `n:<hmac>`. */
const refOpaca = z.string().regex(/^[a-z]{1,5}:[A-Za-z0-9:_-]{1,74}$/);
const extSource = z.enum(["wa", "bot", "claude", "reunion", "llamada", "analisis"]);
const extId = z.string().regex(/^[A-Za-z0-9:_.-]{1,120}$/);

const estadoProyecto = z.enum(["IDEA", "EN_MARCHA", "ESPERANDO", "ATASCADO", "EN_PAUSA", "TERMINADO", "DESCARTADO"]);
const salud = z.enum(["VERDE", "AMARILLO", "ROJO"]);
const color = z.enum(["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]);
const circulo = z.enum(["FAMILIA", "AMIGOS", "TRABAJO", "CLIENTES", "SERVICIOS", "OTROS"]);
const lado = z.enum(["NOSOTROS", "CONTRAPARTE", "ASESOR", "OTRO"]);
const precision = z.enum(["DIA", "SEMANA", "MES", "TRIMESTRE"]);
const estadoHito = z.enum(["PENDIENTE", "EN_CURSO", "HECHO", "BLOQUEADO", "SALTADO"]);
const prioridad = z.enum(["ALTA", "MEDIA", "BAJA"]);
const tipoFuente = z.enum(["LLAMADA", "REUNION", "MENSAJE", "DICTADO", "DOCUMENTO", "CLAUDE"]);
const tipoBitacora = z.enum(["NOTA", "AVANCE", "DECISION", "BLOQUEO", "LLAMADA", "REUNION", "MENSAJE"]);

/** De dónde salió algo: el hecho, nunca el contenido. */
const origenDeAlgo = z
  .object({
    tipo: tipoFuente,
    ref: refOpaca.nullable().optional(),
    etiqueta: textoONulo(PROJECT_LIMITS.sourceLabelTask).optional(),
    en: instante.nullable().optional(),
  })
  .strict();

const ext = {
  ext_source: extSource.optional(),
  ext_id: extId.optional(),
};

// ---------------------------------------------------------------- proyectos

const camposProyecto = z
  .object({
    nombre: texto(PROJECT_NAME_MAX),
    alias,
    estado: estadoProyecto,
    salud: salud.nullable(),
    objetivo: textoONulo(PROJECT_LIMITS.objective),
    como_va: textoONulo(PROJECT_LIMITS.how),
    inicio: fecha.nullable(),
    meta: fecha.nullable(),
  })
  .partial()
  .strict();

const proyectoCrear = z
  .object({
    id,
    nombre: texto(PROJECT_NAME_MAX),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(PROJECT_LIMITS.slug).optional(),
    alias: alias.optional(),
    estado: estadoProyecto.optional(),
    objetivo: textoONulo(PROJECT_LIMITS.objective).optional(),
    como_va: textoONulo(PROJECT_LIMITS.how).optional(),
    inicio: fecha.nullable().optional(),
    meta: fecha.nullable().optional(),
    color: color.optional(),
    ...ext,
  })
  .strict();

const proyectoCambiar = z.object({ id, campos: camposProyecto }).strict();

const docGuardar = z
  .object({
    proyecto_id: id,
    tipo: z.literal("FICHA"),
    cuerpo: z.string().max(PROJECT_LIMITS.docBody),
    /** Con origin owner: la redactó el asistente y el dueño dijo «sí» (BOT) o la dictó él (OWNER). */
    autor: z.enum(["OWNER", "BOT"]).optional(),
  })
  .strict();

// ----------------------------------------------------------------- personas

const camposPersona = z
  .object({
    nombre: texto(80),
    alias: alias,
    relacion: textoONulo(120),
    org: textoONulo(120),
    circulo: circulo.nullable(),
    whatsapp: z.enum(["SI", "NO"]).nullable(),
  })
  .partial()
  .strict();

const personaCrear = z
  .object({
    id,
    nombre: texto(80),
    alias: alias.optional(),
    relacion: textoONulo(120).optional(),
    org: textoONulo(120).optional(),
    circulo: circulo.nullable().optional(),
    whatsapp: z.enum(["SI", "NO"]).nullable().optional(),
    ...ext,
  })
  .strict();

const personaCambiar = z.object({ id, campos: camposPersona }).strict();

/** «Esta persona es este WhatsApp», tras el «sí» escrito del dueño. El número no viaja. */
const personaEnlazarWa = z.object({ id, enlazada: z.boolean() }).strict();

const personasUnir = z.object({ queda: id, se_va: id }).strict();

// ------------------------------------------------------------------ miembros

const miembroPoner = z
  .object({
    id,
    proyecto_id: id,
    persona_id: id,
    papel: textoONulo(PROJECT_LIMITS.memberRole).optional(),
    hace: textoONulo(PROJECT_LIMITS.memberDoes).optional(),
    lado: lado.nullable().optional(),
    lider: z.boolean().optional(),
  })
  .strict();

const miembroQuitar = z.object({ proyecto_id: id, persona_id: id }).strict();

// ------------------------------------------------------------------- trabajo

const frenteCrear = z
  .object({ id, proyecto_id: id, nombre: texto(PROJECT_LIMITS.streamName), responsable_id: id.nullable().optional() })
  .strict();

const hitoCrear = z
  .object({
    id,
    proyecto_id: id,
    tipo: z.enum(["ETAPA", "HITO"]),
    etapa_id: id.nullable().optional(),
    titulo: texto(PROJECT_LIMITS.milestoneTitle),
    inicio: fecha.nullable().optional(),
    fecha: fecha.nullable().optional(),
    precision: precision.optional(),
    responsable_id: id.nullable().optional(),
    ...ext,
  })
  .strict();

const hitoCambiar = z
  .object({
    id,
    campos: z
      .object({
        titulo: texto(PROJECT_LIMITS.milestoneTitle),
        fecha: fecha.nullable(),
        precision,
        estado: estadoHito,
        bloqueo: textoONulo(300),
        responsable_id: id.nullable(),
      })
      .partial()
      .strict(),
  })
  .strict();

const tareaCrear = z
  .object({
    id,
    titulo: texto(PROJECT_LIMITS.taskTitle),
    proyecto_id: id.nullable().optional(),
    responsable_id: id.nullable().optional(),
    con_ids: z.array(id).max(10).optional(),
    frente_id: id.nullable().optional(),
    hito_id: id.nullable().optional(),
    madre_id: id.nullable().optional(),
    fecha: fecha.nullable().optional(),
    prioridad: prioridad.optional(),
    fuente: origenDeAlgo.optional(),
    /** Cómo lo dijo el dueño (sólo con origin owner). */
    via: z.enum(["texto", "voz"]).optional(),
    ...ext,
  })
  .strict();

const tareaCambiar = z
  .object({
    id,
    campos: z
      .object({
        titulo: texto(PROJECT_LIMITS.taskTitle),
        fecha: fecha.nullable(),
        responsable_id: id.nullable(),
        proyecto_id: id.nullable(),
        frente_id: id.nullable(),
        hito_id: id.nullable(),
        prioridad,
        estado: z.enum(["NO_INICIADA", "EN_CURSO"]),
      })
      .partial()
      .strict(),
  })
  .strict();

const soloId = z.object({ id }).strict();

// ------------------------------------------------------------------- avances

const bitacoraNota = z
  .object({
    id,
    proyecto_id: id,
    tipo: tipoBitacora,
    titulo: texto(PROJECT_LIMITS.logTitle),
    texto: textoONulo(PROJECT_LIMITS.logBody).optional(),
    en: instante.optional(),
    persona_ids: z.array(id).max(20).optional(),
    fuente: origenDeAlgo.optional(),
    ...ext,
  })
  .strict();

const fuentePoner = z
  .object({
    id,
    proyecto_id: id,
    tipo: z.enum(["CHAT", "GRUPO", "LLAMADA", "REUNION", "DOCUMENTO", "ARCHIVO_MAC"]),
    etiqueta: texto(PROJECT_LIMITS.sourceLabel),
    ref: refOpaca.nullable().optional(),
    persona_ids: z.array(id).max(20).optional(),
    en: instante.nullable().optional(),
    duracion_s: z.number().int().min(0).max(86_400).nullable().optional(),
    confirmada: z.boolean().optional(),
    ...ext,
  })
  .strict();

/** Se borró en la Mac (una reunión, una llamada): todo lo que colgaba de esa referencia se va. */
const fuenteBorrada = z.object({ ref: refOpaca }).strict();

// ------------------------------------------------------------ recordatorios

const recordatorioCrear = z
  .object({
    id,
    texto: textoONulo(200),
    tipo: z.enum(["TEXTO", "QUE_FALTA", "COMO_VA", "TU_DIA"]).optional(),
    entidad: z.object({ tipo: z.enum(["PROYECTO", "TAREA", "PERSONA"]), id }).strict().nullable().optional(),
    frecuencia: z.enum(["UNA_VEZ", "DIARIO", "LABORABLES", "SEMANAL", "MENSUAL", "CADA_N_DIAS"]),
    cada_n: z.number().int().min(1).max(365).nullable().optional(),
    hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dias: z.array(z.number().int().min(1).max(7)).max(7).optional(),
    dia_del_mes: z.number().int().min(-1).max(31).nullable().optional(),
    el_dia: fecha.nullable().optional(),
    hasta: fecha.nullable().optional(),
    ...ext,
  })
  .strict();

const recordatorioCambiar = z
  .object({
    id,
    campos: z
      .object({ texto: textoONulo(200), hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), activo: z.boolean() })
      .partial()
      .strict(),
  })
  .strict();

const disparo = z.object({ id, disparo: instante }).strict();
const recordatorioPosponer = z.object({ id, disparo: instante, hasta: instante }).strict();

// --------------------------------------------------------------- propuestas

/** Lo que hace falta para aceptarla de un toque. Nunca el texto de un mensaje. */
const datosPropuesta = z
  .object({
    responsable_id: id.nullable(),
    fecha: fecha.nullable(),
    hito_id: id.nullable(),
    frente_id: id.nullable(),
    persona_ids: z.array(id).max(10),
    tipo_bitacora: tipoBitacora,
    duracion_s: z.number().int().min(0).max(86_400),
  })
  .partial()
  .strict();

const propuestaCrear = z
  .object({
    id,
    tipo: z.enum(["TAREA", "AVANCE", "DECISION", "HITO", "PERSONA", "MIEMBRO", "FUENTE", "COMO_VA", "CIERRE", "ORDEN"]),
    proyecto_id: id.nullable().optional(),
    otros_proyectos: z.array(id).max(5).optional(),
    titulo: texto(200),
    datos: datosPropuesta.optional(),
    confianza: z.enum(["FIRME", "DUDOSA"]),
    porque: textoONulo(120).optional(),
    fuente: origenDeAlgo.optional(),
    ...ext,
  })
  .strict();

const propuestaDecidir = z
  .object({
    id,
    decision: z.enum(["ACEPTADA", "DESCARTADA"]),
    via: z.enum(["WHATSAPP", "VOZ", "CLAUDE"]),
    motivo: z.enum(["NO_ES_TAREA", "OTRO_PROYECTO", "YA_HECHA", "OTRO"]).optional(),
    resultado: z.object({ tipo: z.enum(["tarea", "bitacora", "hito", "persona", "miembro", "fuente"]), id }).strict().optional(),
  })
  .strict();

// ------------------------------------------------------- estado del motor

const cifra = z.number().int().min(0).max(100_000);

/** Sólo números: nada de nombres ni textos de nadie. */
export const CIFRAS_DE_WHATSAPP = [
  "chats_esperando",
  "tomados",
  "sin_leer",
  "deudas",
  "escaladas",
  "llamadas_perdidas",
  "propuestas_abiertas",
] as const;

const metricasDelDia = z
  .object({
    fecha,
    cifras: z
      .object(Object.fromEntries(CIFRAS_DE_WHATSAPP.map((k) => [k, cifra])) as Record<(typeof CIFRAS_DE_WHATSAPP)[number], typeof cifra>)
      .partial()
      .strict(),
  })
  .strict();

const agenteEstado = z
  .object({
    boot_id: z.string().regex(/^[0-9a-f-]{8,64}$/),
    version: z.string().regex(/^[0-9A-Za-z.+_-]{1,40}$/),
    panel_url: z
      .string()
      .max(200)
      .regex(/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/-]*)?$/)
      .nullable(),
    wa_conectado: z.boolean(),
    donde: z.enum(["MAC", "SERVIDOR"]),
  })
  .strict();

// ---------------------------------------------------------------- el sobre

export const DATOS_POR_OPERACION = {
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
  tarea_hecha: soloId,
  tarea_reabrir: soloId,
  bitacora_nota: bitacoraNota,
  fuente_poner: fuentePoner,
  fuente_quitar: soloId,
  fuente_borrada: fuenteBorrada,
  recordatorio_crear: recordatorioCrear,
  recordatorio_cambiar: recordatorioCambiar,
  recordatorio_hecho: disparo,
  recordatorio_posponer: recordatorioPosponer,
  recordatorio_copiado: disparo,
  propuesta_crear: propuestaCrear,
  propuesta_retirar: soloId,
  propuesta_decidir: propuestaDecidir,
  metricas_del_dia: metricasDelDia,
  agente_estado: agenteEstado,
} as const satisfies Record<Operacion, z.ZodType>;

export type DatosDe<K extends Operacion> = z.infer<(typeof DATOS_POR_OPERACION)[K]>;

export const sobreSchema = z
  .object({
    v: z.literal(1),
    op_id: id,
    kind: z.enum(OPERACIONES),
    at: instante,
    origin: z.enum(ORIGENES),
    base_version: z.number().int().min(1).max(1_000_000).optional(),
    data: z.unknown(),
  })
  .strict();

export type Sobre = z.infer<typeof sobreSchema>;

export const loteSchema = z.object({ ops: z.array(z.unknown()).min(1).max(OPS_POR_LOTE) }).strict();

export type OperacionValida = {
  [K in Operacion]: Omit<Sobre, "kind" | "data"> & { kind: K; data: DatosDe<K> };
}[Operacion];

/** Valida un sobre y sus datos. `null` con el motivo si no vale. */
export function validarOperacion(
  valor: unknown,
): { ok: true; op: OperacionValida } | { ok: false; opId: string | null; motivo: string } {
  const sobre = sobreSchema.safeParse(valor);
  if (!sobre.success) {
    const opId =
      valor && typeof valor === "object" && typeof (valor as { op_id?: unknown }).op_id === "string"
        ? z.uuid().safeParse((valor as { op_id: string }).op_id).success
          ? (valor as { op_id: string }).op_id
          : null
        : null;
    return { ok: false, opId, motivo: "forma" };
  }
  const datos = DATOS_POR_OPERACION[sobre.data.kind].safeParse(sobre.data.data);
  if (!datos.success) return { ok: false, opId: sobre.data.op_id, motivo: "datos" };
  return { ok: true, op: { ...sobre.data, data: datos.data } as OperacionValida };
}
