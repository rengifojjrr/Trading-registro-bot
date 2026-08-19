import {
  dateEnd,
  dateStart,
  dateStartTime,
  findProperty,
  matchOptions,
  multiSelectNames,
  plainText,
  selectName,
  type NotionProperties,
} from "@/lib/notion/properties";

import { CATEGORIES, type TaskPriority, type TaskStatus } from "./tasks";

/**
 * Traduce la «✅ To-Do Base de Datos» de Notion.
 *
 * Es el módulo que mejor venía montado, así que la traducción es casi
 * literal: los tres estados, las tres prioridades y las ocho categorías son
 * los mismos. Lo único que cambia de sitio es el proyecto, que en Notion es
 * una opción de una lista y aquí es una fila propia, para que pueda archivarse
 * sin que las tareas que colgaban de él pierdan su etiqueta.
 */

export interface NotionMappedTask {
  notion_page_id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  /** El último día, cuando la tarea de Notion tenía rango. */
  due_end: string | null;
  /** `HH:MM`, cuando la fecha traía hora. */
  due_time: string | null;
  categories: string[];
  /** El cuerpo de la página: lo que la tarea explica. */
  description: string | null;
  icon: string | null;
  /** El nombre del proyecto; el llamador lo resuelve a un identificador. */
  project: string | null;
}

const STATUS_FROM_NOTION: Record<string, TaskStatus> = {
  "Not started": "NO_INICIADA",
  "In progress": "EN_CURSO",
  Done: "HECHA",
};

const PRIORITY_FROM_NOTION: Record<string, TaskPriority> = {
  Alta: "ALTA",
  Media: "MEDIA",
  Baja: "BAJA",
};

export interface TaskMappingResult {
  task: NotionMappedTask;
  warnings: string[];
}

export function mapNotionTask(page: {
  id: string;
  properties: NotionProperties;
  /** El cuerpo de la página. Sólo llega si la lectura lo pidió. */
  body?: string | null;
  icon?: string | null;
}): TaskMappingResult | null {
  const properties = page.properties ?? {};

  const title = plainText(findProperty(properties, "Name"));
  if (title === null) return null;

  const warnings: string[] = [];

  const statusLabel = selectName(findProperty(properties, "Estado"));
  const status = statusLabel ? STATUS_FROM_NOTION[statusLabel] : undefined;
  if (statusLabel && !status) warnings.push(`Estado desconocido: «${statusLabel}»`);

  const priorityLabel = selectName(findProperty(properties, "Prioridad"));
  const priority = priorityLabel ? PRIORITY_FROM_NOTION[priorityLabel] : undefined;
  if (priorityLabel && !priority) warnings.push(`Prioridad desconocida: «${priorityLabel}»`);

  // La columna de categorías se quedó con el nombre por defecto de Notion,
  // «Multi-select», porque nunca se renombró. Se busca por ese nombre y no por
  // uno bonito que no existe.
  const categories = matchOptions(
    multiSelectNames(findProperty(properties, "Multi-select")),
    CATEGORIES,
  );
  for (const dropped of categories.dropped) {
    warnings.push(`Categoría desconocida: «${dropped}»`);
  }

  return {
    task: {
      notion_page_id: page.id,
      title,
      // Sin estado, una tarea está sin empezar: es lo que menos afirma.
      status: status ?? "NO_INICIADA",
      priority: priority ?? "MEDIA",
      due_date: dateStart(findProperty(properties, "Fecha")),
      due_end: dateEnd(findProperty(properties, "Fecha")),
      due_time: dateStartTime(findProperty(properties, "Fecha")),
      categories: categories.kept,
      // «Crear Inventario» lleva escrito dentro «Hacer inventario de trendy
      // sports». Todo eso vive en el cuerpo de la página, no en una propiedad,
      // y por eso ninguna tarea traía su explicación.
      description: page.body ?? null,
      icon: page.icon ?? null,
      project: selectName(findProperty(properties, "Projectos")),
    },
    warnings,
  };
}

/** Los proyectos que aparecen de verdad en las tareas, sin repetir. */
export function projectsIn(tasks: NotionMappedTask[]): string[] {
  const names = new Set<string>();
  for (const task of tasks) {
    if (task.project) names.add(task.project);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "es"));
}
