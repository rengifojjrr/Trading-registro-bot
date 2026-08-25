/**
 * Sacar cualquier módulo a CSV con el mismo formateador.
 *
 * Trading podía exportarse desde el primer día y los siete módulos de vida no
 * podían de ninguna forma: meses de sueño, hábitos y tareas encerrados en la
 * aplicación, sin manera de abrirlos en una hoja de cálculo ni de llevárselos
 * a ninguna parte. Una aplicación privada que no deja sacar tus propios datos
 * es una que te tiene, no una que te sirve.
 *
 * Va aquí y no en cada módulo a propósito: dos formateadores de CSV acaban
 * dando dos respuestas distintas al mismo dato -- comillas, comas dentro de
 * una nota, decimales con coma -- y sólo uno tiene los tests.
 *
 * Puro: recibe filas y devuelve texto.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lineas = [columns.map((c) => cell(c.header)).join(",")];

  for (const row of rows) {
    lineas.push(columns.map((c) => cell(c.value(row))).join(","));
  }

  return lineas.join("\n");
}

/**
 * Una celda escapada según el RFC 4180.
 *
 * Se entrecomilla sólo cuando hace falta -- coma, comilla o salto de línea --
 * porque un CSV con todo entrecomillado es correcto y es ilegible al abrirlo
 * en un editor de texto, que es la mitad de las veces que se abre.
 *
 * Los decimales van con punto, no con coma: es lo que espera cualquier hoja de
 * cálculo configurada en inglés, y una nota que lleve una coma dentro no puede
 * distinguirse de un separador si además los números las usan.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const texto = String(value);
  if (texto === "") return "";

  const necesitaComillas = /[",\n\r]/.test(texto);
  return necesitaComillas ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * El nombre del archivo, con el módulo y la fecha.
 *
 * Con la fecha porque en la carpeta de descargas van a acabar varios: sin
 * ella, el segundo se llama «habitos (1).csv» y ya nadie sabe cuál es cuál.
 */
export function moduleCsvFilename(module: string, date = new Date()): string {
  const dia = date.toISOString().slice(0, 10);
  return `${module}_${dia}.csv`;
}

/**
 * El BOM que necesita Excel en Windows para leer los acentos.
 *
 * Sin él, «sueño» se abre como «sueÃ±o». No es cosmético: una exportación que
 * hay que arreglar a mano al abrirla es una que no se vuelve a usar.
 */
export const CSV_BOM = "﻿";
