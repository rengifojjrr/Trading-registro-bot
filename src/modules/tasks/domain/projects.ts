import { z } from "zod";

/**
 * Proyectos, en su forma pura.
 *
 * Por ahora sólo el nombre. Aquí irán también el semáforo, el avance y «lo
 * próximo» de cada proyecto, que se calculan sin guardar nada.
 */

/**
 * Lo que cabe en el nombre de un proyecto.
 *
 * Lo manda la base: `tasks_projects.name` tiene `char_length(trim(name))
 * between 1 and 60`. El formulario aceptaba 120, así que un nombre de 61 a 120
 * pasaba la validación, llegaba a la base y volvía como «No se pudo crear el
 * proyecto», sin decir por qué. La prueba de al lado lee la migración y falla
 * si los dos números dejan de coincidir.
 */
export const PROJECT_NAME_MAX = 60;

/** El nombre de un proyecto, recortado, con el mismo tope que la base. */
export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Ponle nombre al proyecto.")
  .max(PROJECT_NAME_MAX, `Máximo ${PROJECT_NAME_MAX} caracteres.`);
