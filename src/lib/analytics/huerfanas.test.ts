import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Nada que liste o sume operaciones puede contar las huérfanas.
 *
 * Una operación queda huérfana cuando un recálculo mueve los límites de
 * posición y su fill de apertura deja de abrir nada. No se borra, porque el
 * historial tiene que seguir siendo auditable, pero describe un pasado que ya
 * no es cierto: contarla en un total o enseñarla en una lista es enseñar la
 * misma operación dos veces, una buena y otra vieja.
 *
 * Esto se comprueba con un test y no a ojo porque cuarenta y tres consultas
 * leían `trades` y sólo cinco lo excluían. Nunca llegó a verse mal de puro
 * milagro -- no había ninguna huérfana todavía -- y la primera reconstrucción
 * que redibujara los límites lo habría roto todo a la vez, en el panel, en el
 * diario, en el calendario y en los informes.
 */

const RAIZ = join(process.cwd(), "src");

/**
 * Consultas que leen `trades` y no necesitan el filtro, cada una con su
 * motivo. Que una excepción exista no es gratis: es un sitio donde alguien
 * decidió que enseñar una huérfana está bien.
 */
const PERMITIDAS = new Map<string, string>([
  [
    "app/api/export/backup/route.ts",
    "La copia de seguridad es el volcado literal de la base de datos. Filtrar aquí sería entregar una copia incompleta.",
  ],
  [
    "lib/reconstruction/persist.ts",
    "Es quien marca y desmarca las huérfanas: tiene que verlas para poder devolverlas a la vida cuando un recálculo las vuelve reales otra vez.",
  ],
  [
    "lib/notion/sync.ts",
    "Espeja una operación concreta por su identificador, no lista nada.",
  ],
  [
    "core/trash.ts",
    "La papelera trabaja sobre la fila que se le señala.",
  ],
]);

/**
 * Una consulta que apunta a una operación concreta no necesita el filtro:
 * abrir la ficha de una huérfana para ver qué pasó es legítimo, y de hecho es
 * lo único que hace que marcarlas en vez de borrarlas sirva de algo.
 */
const PIDE_UNA_CONCRETA = /\.eq\(\s*["']id["']|\.in\(\s*["']id["']|\.eq\(\s*["']trade_id["']/;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    if (!/\.tsx?$/.test(nombre) || /\.test\.tsx?$/.test(nombre)) return [];
    return [ruta];
  });
}

/**
 * Lo que rodea a cada `.from("trades")`: su línea y las dieciocho
 * siguientes.
 *
 * Una ventana de líneas y no la sentencia exacta a propósito. Media docena de
 * estas consultas se escriben en dos pasos -- `let query = supabase.from(…)` y
 * `query = applyFilters(query, filters)` en la línea de después -- así que
 * cortar por el punto y coma se dejaría fuera justo lo que hace falta ver.
 * Esto es un detector de humo, no un analizador sintáctico: más vale que sea
 * ancho y tosco a que dé por buena una consulta porque no supo leerla.
 */
function consultas(fuente: string): string[] {
  const lineas = fuente.split("\n");
  return lineas
    .map((linea, i) => (linea.includes('.from("trades")') ? lineas.slice(i, i + 18).join("\n") : null))
    .filter((v): v is string => v !== null);
}

describe("operaciones huérfanas", () => {
  it("ninguna consulta que liste o sume las cuenta", () => {
    const olvidadas: string[] = [];

    for (const ruta of archivos(RAIZ)) {
      const relativa = relative(RAIZ, ruta).replaceAll("\\", "/");
      if (PERMITIDAS.has(relativa)) continue;

      const fuente = readFileSync(ruta, "utf8");
      for (const consulta of consultas(fuente)) {
        if (consulta.includes("orphaned_at")) continue;
        if (PIDE_UNA_CONCRETA.test(consulta)) continue;
        if (consulta.includes("applyFilters")) continue; // applyFilters lo pone
        olvidadas.push(`${relativa} → ${consulta.split("\n").slice(0, 3).join(" ").trim()}`);
      }
    }

    expect(olvidadas).toEqual([]);
  });

  it("applyFilters lo pone siempre, no según el filtro", () => {
    // Es de donde lo heredan el panel, la tabla, el diario y las
    // estadísticas. Si se colara dentro de un `if`, una vista sin filtros
    // volvería a contar las huérfanas.
    const fuente = readFileSync(join(RAIZ, "lib/analytics/queries.ts"), "utf8");
    const cuerpo = fuente.slice(
      fuente.indexOf("export function applyFilters"),
      fuente.indexOf("export function applyIdRestriction"),
    );
    const linea = cuerpo.split("\n").find((l) => l.includes("orphaned_at"));
    expect(linea?.trim()).toBe('q = q.is("orphaned_at", null);');
  });

  it("cada excepción sigue existiendo y sigue teniendo su motivo", () => {
    for (const [relativa, motivo] of PERMITIDAS) {
      expect(() => statSync(join(RAIZ, relativa)), relativa).not.toThrow();
      expect(motivo.length, relativa).toBeGreaterThan(40);
    }
  });
});
