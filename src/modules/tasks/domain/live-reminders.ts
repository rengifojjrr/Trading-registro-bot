import type { ProjectHealth } from "@/types/database";

import { HEALTH_LABELS, compareProjectTasks, dayLabel } from "./projects";
import type { TaskPriority, TaskStatus } from "./tasks";

/**
 * Lo que dicen los recordatorios «vivos» al sonar, armado en ese momento con
 * los datos de ese momento: «Qué falta en X», «Cómo va X» y «Tu día».
 *
 * Puro y sin IA: plantillas. Lo usa `/api/push/pending` (el texto de la
 * notificación) y lo usará el bot para su copia en «🤖 Mi bot». Textos cortos y
 * llanos, sin flechas ni jerga, como los del bot.
 */

export interface Aviso {
  title: string;
  body: string;
}

const MAX_BODY = 240;

function corta(texto: string): string {
  return texto.length <= MAX_BODY ? texto : `${texto.slice(0, MAX_BODY - 1).trimEnd()}…`;
}

export interface TareaParaAviso {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  parent_id: string | null;
}

/**
 * «Qué falta en Petróleo VZ»: lo abierto, lo atrasado primero, con quién lo
 * hace. «Tú: llamar al abogado (jue 9) · Andrés: los análisis (15 oct) · y 3 más».
 */
export function queFaltaAviso(
  proyecto: string,
  tareas: TareaParaAviso[],
  ownerId: string | null,
  nombres: Record<string, string>,
  today: string,
  max = 3,
): Aviso {
  const abiertas = tareas
    .filter((t) => t.status !== "HECHA" && t.parent_id === null)
    .sort((a, b) => compareProjectTasks(a, b, today));
  const title = `Qué falta en ${proyecto}`;
  if (abiertas.length === 0) return { title, body: "Nada pendiente. Todo al día." };
  const partes = abiertas.slice(0, max).map((t) => {
    const quien =
      t.assignee_id === null || t.assignee_id === ownerId ? "Tú" : (nombres[t.assignee_id] ?? "Alguien");
    const cuando = t.due_date ? ` (${dayLabel(t.due_date, today)})` : "";
    return `${quien}: ${t.title}${cuando}`;
  });
  const resto = abiertas.length - max;
  if (resto > 0) partes.push(`y ${resto} más`);
  return { title, body: corta(partes.join(" · ")) };
}

/** «Cómo va Petróleo VZ»: el semáforo con su porqué, lo próximo y lo atrasado. */
export function comoVaAviso(
  proyecto: string,
  datos: {
    health: { level: ProjectHealth | null; why: string };
    next: { title: string; date: string } | null;
    overdue: number;
    open: number;
    progressLabel: string | null;
  },
  today: string,
): Aviso {
  const partes: string[] = [];
  partes.push(datos.health.level ? `${HEALTH_LABELS[datos.health.level]}: ${datos.health.why}` : datos.health.why);
  if (datos.next) partes.push(`Lo próximo: ${datos.next.title} (${dayLabel(datos.next.date, today)})`);
  if (datos.overdue > 0) partes.push(`${datos.overdue} ${datos.overdue === 1 ? "atrasada" : "atrasadas"}`);
  else if (datos.open > 0) partes.push(`${datos.open} ${datos.open === 1 ? "pendiente" : "pendientes"}`);
  if (datos.progressLabel) partes.push(datos.progressLabel);
  return { title: `Cómo va ${proyecto}`, body: corta(partes.join(" · ")) };
}

/**
 * «Tu día» (el resumen de la mañana, como push que suena): lo de hoy, lo
 * atrasado, lo que va a sonar y los proyectos que piden atención.
 */
export function tuDiaAviso(datos: {
  paraHoy: number;
  atrasadas: number;
  recordatorios: number;
  proyectos: { name: string; level: ProjectHealth | null }[];
  primera: string | null;
}): Aviso {
  const partes: string[] = [];
  if (datos.paraHoy > 0) partes.push(`${datos.paraHoy} ${datos.paraHoy === 1 ? "tarea" : "tareas"} para hoy`);
  if (datos.atrasadas > 0) partes.push(`${datos.atrasadas} ${datos.atrasadas === 1 ? "atrasada" : "atrasadas"}`);
  if (datos.recordatorios > 0) {
    partes.push(`${datos.recordatorios} ${datos.recordatorios === 1 ? "recordatorio" : "recordatorios"} más`);
  }
  const rojos = datos.proyectos.filter((p) => p.level === "ROJO");
  const amarillos = datos.proyectos.filter((p) => p.level === "AMARILLO");
  for (const p of [...rojos, ...amarillos].slice(0, 2)) partes.push(`${p.name}: ${HEALTH_LABELS[p.level!].toLowerCase()}`);
  if (partes.length === 0) return { title: "Tu día", body: "Nada para hoy. Día libre de pendientes." };
  const primera = datos.primera ? ` Empieza por: ${datos.primera}.` : "";
  return { title: "Tu día", body: corta(`${partes.join(" · ")}.${primera}`) };
}

/** Lo que se ve con la pantalla bloqueada cuando el recordatorio es privado. */
export const AVISO_PRIVADO: Aviso = { title: "Recordatorio", body: "Tienes un recordatorio." };
