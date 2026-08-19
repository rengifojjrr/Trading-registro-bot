import type { EntityKind } from "@/types/database";

/**
 * Qué es cada tipo de entidad de vida, en términos que core pueda usar.
 *
 * Las piezas comunes -- comentarios, adjuntos, vínculos, papelera -- valen
 * para cualquier módulo, y para eso necesitan saber tres cosas de cada uno:
 * cómo se llama en castellano, en qué tabla vive y en qué columna está el
 * título. Nada más. En particular, nada de aquí importa un módulo: si lo
 * hiciera, core dejaría de poder existir sin ellos y la regla de límites de
 * módulo -- la que impide que uno dependa de otro -- se volvería decorativa.
 *
 * La ruta se guarda como una cadena y no como una `Route` tipada porque este
 * archivo se compila antes de que Next haya generado el mapa de rutas.
 */

export interface EntityMeta {
  kind: EntityKind;
  /** Singular, tal y como aparece en un botón o en la papelera. */
  label: string;
  /** Dónde vive la fila. */
  table: string;
  /** La columna que sirve de título en una lista. */
  titleColumn: string;
  /**
   * La columna del icono, cuando la entidad tiene uno.
   *
   * No todas: hábitos ya traía `emoji` de antes y renombrarlo sólo por
   * uniformidad rompería el módulo entero, y una sesión de lectura no es una
   * cosa que se reconozca por un dibujo. Se declara aquí en lugar de añadir
   * columnas vacías para que las tablas no lleven peso que nadie usa.
   */
  iconColumn: string | null;
  /** Dónde está su ficha: `${detailBase}/${id}`. */
  detailBase: string;
  /** El token de color del módulo al que pertenece. */
  colorToken: string;
  /**
   * Tablas hijas que hay que archivar y devolver junto con la fila. Sin esto,
   * restaurar una comida devolvería un nombre sin ingredientes.
   */
  children?: { table: string; foreignKey: string }[];
}

export const ENTITIES: Record<EntityKind, EntityMeta> = {
  SUENO: {
    kind: "SUENO",
    label: "Noche",
    table: "sleep_entries",
    titleColumn: "sleep_date",
    iconColumn: "icon",
    detailBase: "/sueno/historial",
    colorToken: "--mod-sleep",
  },
  HABITO: {
    kind: "HABITO",
    label: "Hábito",
    table: "habits_definitions",
    titleColumn: "name",
    iconColumn: "emoji",
    detailBase: "/habitos",
    colorToken: "--mod-habits",
    children: [{ table: "habits_entries", foreignKey: "habit_id" }],
  },
  TAREA: {
    kind: "TAREA",
    label: "Tarea",
    table: "tasks_items",
    titleColumn: "title",
    iconColumn: "icon",
    detailBase: "/tareas",
    colorToken: "--mod-tasks",
  },
  PROYECTO: {
    kind: "PROYECTO",
    label: "Proyecto",
    table: "tasks_projects",
    titleColumn: "name",
    iconColumn: "icon",
    detailBase: "/tareas/proyectos",
    colorToken: "--mod-tasks",
  },
  COMIDA: {
    kind: "COMIDA",
    label: "Comida",
    table: "meals_entries",
    titleColumn: "name",
    iconColumn: "icon",
    detailBase: "/comidas",
    colorToken: "--mod-meals",
    children: [{ table: "meals_ingredients", foreignKey: "meal_id" }],
  },
  LECTURA: {
    kind: "LECTURA",
    label: "Lectura",
    table: "reading_sessions",
    titleColumn: "summary",
    iconColumn: null,
    detailBase: "/lecturas",
    colorToken: "--mod-reading",
  },
  LIBRO: {
    kind: "LIBRO",
    label: "Libro",
    table: "reading_books",
    titleColumn: "title",
    iconColumn: "icon",
    detailBase: "/lecturas/libros",
    colorToken: "--mod-reading",
  },
  CONTENIDO: {
    kind: "CONTENIDO",
    label: "Pieza",
    table: "content_pieces",
    titleColumn: "title",
    iconColumn: "icon",
    detailBase: "/contenido",
    colorToken: "--mod-content",
  },
};

export const ENTITY_KINDS = Object.keys(ENTITIES) as EntityKind[];

/** La ruta de la ficha de una entidad. */
export function entityHref(kind: EntityKind, id: string): string {
  return `${ENTITIES[kind].detailBase}/${id}`;
}

export function isEntityKind(value: string): value is EntityKind {
  return value in ENTITIES;
}
