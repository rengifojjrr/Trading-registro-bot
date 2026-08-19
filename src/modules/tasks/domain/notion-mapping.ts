import {
  dateStart,
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
  categories: string[];
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
      categories: categories.kept,
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
