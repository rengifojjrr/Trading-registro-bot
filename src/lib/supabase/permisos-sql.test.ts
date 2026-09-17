import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dos reglas sobre las migraciones que no se ven leyendo el archivo por encima.
 *
 * Las dos salieron del mismo sitio: los avisos del linter de Supabase decían
 * algo que era verdad y que nadie habría encontrado a ojo, y las dos veces el
 * fallo estaba en una línea que *parecía* correcta.
 *
 * 1. **`revoke ... from public` no cierra una función.** Supabase tiene puesto
 *    un `alter default privileges ... grant execute on functions to anon,
 *    authenticated` sobre el esquema `public`, así que cada función nueva nace
 *    con dos permisos explícitos además del de PUBLIC. Quitarle el de PUBLIC
 *    deja los otros dos. Tres funciones `security definer` --las que reescriben
 *    operaciones de una cuenta entera-- llevaban meses llamables sin sesión
 *    por culpa de eso.
 *
 * 2. **`auth.uid()` suelto en una política se llama una vez por fila.**
 *    Envuelto en un subselect se llama una vez por consulta. Treinta y dos
 *    políticas lo tenían suelto porque es lo que sale de escribirlas del modo
 *    natural.
 *
 * Las dos se arreglaron. Esto es para que no vuelvan: un fallo que se arregla
 * y no se vigila es un fallo que vuelve con la siguiente tabla.
 */

const DIRECTORIO = join(process.cwd(), "supabase/migrations");

const ficheros = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** El SQL sin comentarios: lo que de verdad se ejecuta. */
function sql(fichero: string): string {
  return readFileSync(join(DIRECTORIO, fichero), "utf8").replace(
    /\/\*[\s\S]*?\*\/|--[^\n]*/g,
    " ",
  );
}

const todo = ficheros.map(sql).join("\n").toLowerCase();

describe("las funciones security definer están cerradas al anónimo", () => {
  /** Los nombres de función declarados `security definer` en las migraciones. */
  const declaradas = [
    ...new Set(
      [...todo.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/g)]
        .map((m) => m[1])
        .filter((nombre) => {
          // Sólo las que llevan `security definer` en su propio cuerpo.
          const cuerpo = new RegExp(
            `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${nombre}\\s*\\([\\s\\S]*?\\$\\$`,
            "g",
          );
          return [...todo.matchAll(cuerpo)].some((m) => m[0].includes("security definer"));
        }),
    ),
  ];

  it("hay funciones security definer que vigilar", () => {
    // Si esto falla, la expresión de arriba dejó de encontrarlas y las demás
    // comprobaciones estarían pasando sobre una lista vacía.
    expect(declaradas.length).toBeGreaterThan(0);
  });

  it.each(declaradas)("%s aparece en un revoke que nombra a anon", (nombre) => {
    // `revoke ... from public` no vale, y ése es justamente el error que
    // costó tres funciones abiertas. Tiene que nombrar a `anon`.
    const revokes = [...todo.matchAll(/revoke\s+[\s\S]*?\s+from\s+([^;]+);/g)].filter((m) =>
      m[0].includes(`function public.${nombre}`),
    );

    expect(revokes.some((m) => /\banon\b/.test(m[1]))).toBe(true);
  });
});

describe("las políticas no preguntan quién eres una vez por fila", () => {
  /**
   * Sólo de la migración del arreglo en adelante.
   *
   * Las de antes tenían `auth.uid()` suelto y se arreglaron con `alter policy`
   * en `20260917130000`; reescribir su historia no arreglaría nada y el
   * archivo de migraciones es un registro de lo que pasó, no de lo que nos
   * gustaría que hubiera pasado.
   */
  const DESDE = "20260917130000";

  const posteriores = ficheros.filter((f) => f >= DESDE);

  it("hay migraciones posteriores al arreglo", () => {
    expect(posteriores.length).toBeGreaterThan(0);
  });

  it.each(posteriores)("%s no introduce auth.uid() suelto", (fichero) => {
    const texto = sql(fichero).toLowerCase();
    // Se quitan las formas envueltas para que no cuenten como suelta la que
    // sí está bien escrita.
    const sinEnvolver = texto.replace(/\(\s*select\s+auth\.\w+\(\)\s*(?:as\s+\w+\s*)?\)/g, "«ok»");

    expect(sinEnvolver).not.toMatch(/auth\.(uid|jwt|role)\(\)/);
  });
});
