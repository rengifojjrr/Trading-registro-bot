import { z } from "zod";

import { LIMITES_ARCHIVO, type ArchivoProyecto } from "./project-file";
import { PROJECT_LIMITS, PROJECT_NAME_MAX } from "./projects";

/**
 * Lo que el navegador manda al servidor después de leer un archivo.
 *
 * El lector corre en el navegador, así que el servidor no puede fiarse de lo
 * que llega: puede venir de cualquiera con una sesión abierta. Este esquema es
 * estricto -- campos de más se rechazan, listas cerradas, topes de largo y ids
 * con forma de uuid -- y es lo único que el servidor acepta como archivo.
 */

const id = z.string().uuid();
const ref = id.nullable();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const texto = (max: number) => z.string().max(max);
const textoONulo = (max: number) => z.string().max(max).nullable();

const lado = z.enum(["NOSOTROS", "CONTRAPARTE", "ASESOR", "OTRO"]).nullable();
const precision = z.enum(["DIA", "SEMANA", "MES", "TRIMESTRE"]);
const estadoHito = z.enum(["PENDIENTE", "EN_CURSO", "HECHO", "BLOQUEADO", "SALTADO"]);
const estadoTarea = z.enum(["NO_INICIADA", "EN_CURSO", "HECHA"]);
const tipoOrigen = z.enum(["LLAMADA", "REUNION", "MENSAJE", "DICTADO", "DOCUMENTO", "CLAUDE"]).nullable();
const tipoBitacora = z.enum(["NOTA", "AVANCE", "DECISION", "BLOQUEO", "LLAMADA", "REUNION", "MENSAJE", "ESTADO"]);
const linea = z.number().int().min(0).max(100_000);

export const archivoProyectoSchema = z
  .object({
    ref,
    nuevoId: id,
    nombre: z.string().trim().min(1).max(PROJECT_NAME_MAX),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(PROJECT_LIMITS.slug)
      .nullable(),
    alias: z.array(texto(60)).max(20),
    estado: z.enum(["IDEA", "EN_MARCHA", "ESPERANDO", "ATASCADO", "EN_PAUSA", "TERMINADO", "DESCARTADO"]).nullable(),
    nube: z.enum(["COMPLETA", "TITULOS", "RESERVADO"]).nullable(),
    objetivo: textoONulo(PROJECT_LIMITS.objective),
    inicio: fecha.nullable(),
    meta: fecha.nullable(),
    color: z.enum(["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]).nullable(),
    icono: textoONulo(8),
    comoVa: textoONulo(PROJECT_LIMITS.how),
    ficha: textoONulo(PROJECT_LIMITS.docBody),
    personas: z
      .array(
        z
          .object({
            ref,
            nuevoId: id,
            nombre: z.string().trim().min(1).max(80),
            esYo: z.boolean(),
            alias: z.array(texto(60)).max(10),
            relacion: textoONulo(120),
            papel: textoONulo(PROJECT_LIMITS.memberRole),
            lado,
            hace: textoONulo(PROJECT_LIMITS.memberDoes),
            whatsapp: z.enum(["SI", "NO"]).nullable(),
            nota: textoONulo(1000),
            linea,
          })
          .strict(),
      )
      .max(LIMITES_ARCHIVO.personas),
    frentes: z
      .array(
        z
          .object({
            ref,
            nuevoId: id,
            nombre: z.string().trim().min(1).max(PROJECT_LIMITS.streamName),
            responsable: textoONulo(80),
            linea,
          })
          .strict(),
      )
      .max(LIMITES_ARCHIVO.frentes),
    etapas: z
      .array(
        z
          .object({
            ref,
            nuevoId: id,
            titulo: z.string().trim().min(1).max(PROJECT_LIMITS.milestoneTitle),
            inicio: fecha.nullable(),
            fin: fecha.nullable(),
            linea,
          })
          .strict(),
      )
      .max(LIMITES_ARCHIVO.etapas),
    hitos: z
      .array(
        z
          .object({
            ref,
            nuevoId: id,
            titulo: z.string().trim().min(1).max(PROJECT_LIMITS.milestoneTitle),
            fecha: fecha.nullable(),
            precision,
            estado: estadoHito,
            responsable: textoONulo(80),
            etapa: z.number().int().min(0).max(LIMITES_ARCHIVO.etapas).nullable(),
            detalle: textoONulo(PROJECT_LIMITS.milestoneDetail),
            linea,
          })
          .strict(),
      )
      .max(LIMITES_ARCHIVO.hitos),
    tareas: z
      .array(
        z
          .object({
            ref,
            nuevoId: id,
            titulo: z.string().trim().min(1).max(PROJECT_LIMITS.taskTitle),
            estado: estadoTarea,
            quitar: z.boolean(),
            responsable: textoONulo(80),
            fecha: fecha.nullable(),
            frente: textoONulo(PROJECT_LIMITS.streamName),
            prioridad: z.enum(["ALTA", "MEDIA", "BAJA"]).nullable(),
            origen: z.object({ tipo: tipoOrigen, texto: texto(PROJECT_LIMITS.sourceLabelTask) }).strict().nullable(),
            notas: textoONulo(4000),
            padre: z.number().int().min(0).max(LIMITES_ARCHIVO.tareas).nullable(),
            linea,
          })
          .strict(),
      )
      .max(LIMITES_ARCHIVO.tareas),
    recordatorios: z.array(texto(200)).max(LIMITES_ARCHIVO.recordatorios),
    bitacora: z
      .array(
        z
          .object({
            ref,
            nuevoId: id,
            fecha,
            tipo: tipoBitacora,
            texto: z.string().trim().min(1).max(PROJECT_LIMITS.logBody),
            linea,
          })
          .strict(),
      )
      .max(LIMITES_ARCHIVO.bitacora),
    enlaces: z
      .array(
        z
          .object({
            ref,
            nuevoId: id,
            etiqueta: z.string().trim().min(1).max(PROJECT_LIMITS.sourceLabel),
            url: z
              .string()
              .max(PROJECT_LIMITS.sourceRef)
              .regex(/^https?:\/\/\S+$/i)
              .nullable(),
            enMac: z.boolean(),
            linea,
          })
          .strict(),
      )
      .max(LIMITES_ARCHIVO.enlaces),
    avisos: z.array(z.object({ linea: linea.nullable(), texto: texto(300) }).strict()).max(200),
    faltan: z.number().int().min(0).max(10_000),
  })
  .strict()
  .superRefine((a, ctx) => {
    // Una subtarea cuelga de una tarea que va antes, y un hito de una etapa
    // que existe: el plan lo da por hecho.
    a.tareas.forEach((t, i) => {
      if (t.padre !== null && (t.padre >= i || a.tareas[t.padre]?.padre !== null)) {
        ctx.addIssue({ code: "custom", path: ["tareas", i, "padre"], message: "Subtarea mal colgada." });
      }
    });
    a.hitos.forEach((h, i) => {
      if (h.etapa !== null && h.etapa >= a.etapas.length) {
        ctx.addIssue({ code: "custom", path: ["hitos", i, "etapa"], message: "Hito de una etapa que no existe." });
      }
    });
    const ids = [
      a.nuevoId,
      ...a.personas.map((x) => x.nuevoId),
      ...a.frentes.map((x) => x.nuevoId),
      ...a.etapas.map((x) => x.nuevoId),
      ...a.hitos.map((x) => x.nuevoId),
      ...a.tareas.map((x) => x.nuevoId),
      ...a.bitacora.map((x) => x.nuevoId),
      ...a.enlaces.map((x) => x.nuevoId),
    ];
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["nuevoId"], message: "Ids repetidos." });
    }
  });

/** Valida lo que llega del navegador. Devuelve el archivo o nada. */
export function validarArchivo(valor: unknown): ArchivoProyecto | null {
  const r = archivoProyectoSchema.safeParse(valor);
  return r.success ? (r.data as ArchivoProyecto) : null;
}
