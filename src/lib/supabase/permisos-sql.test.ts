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
 * 1. **Cerrar una función hace falta decirlo dos veces.** Una función nace con
 *    el permiso implícito de PUBLIC, y Supabase le añade encima un
 *    `alter default privileges ... grant execute on functions to anon,
 *    authenticated` sobre el esquema `public`. Son permisos distintos: quitar
 *    uno no toca el otro. `revoke ... from public` deja abierto a `anon`, y
 *    `revoke ... from anon` deja abierto a PUBLIC -- que incluye a `anon`. Hay
 *    que nombrar a los dos, y el archivo de migraciones tiene un ejemplo de
 *    cada error: tres funciones `security definer` llevaban meses llamables
 *    sin sesión por el primero, y `paper_caida_maxima_conjunta` nació con el
 *    segundo.
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

describe("ninguna función del esquema queda abierta al anónimo", () => {
  /**
   * Todas las funciones que declaran las migraciones, no sólo las
   * `security definer`.
   *
   * La regla empezó siendo sobre ésas, porque son las que se saltan las RLS y
   * son las que costaron el susto. Pero el descuido no distingue: la primera
   * `security invoker` que se escribió después --la de la caída conjunta-- lo
   * repitió, y aunque ahí no había fuga que temer (sin sesión no se ve una
   * fila) sí había treinta y cinco mil filas de trabajo que cualquiera con la
   * clave publicable podía pedir sin entrar.
   *
   * Las dos de disparador entran también. No se pueden llamar --Postgres se
   * niega a ejecutar una función que devuelve `trigger` fuera de uno-- y aun
   * así llevan su revoke desde `20260917190000`, porque una regla con
   * excepciones es una regla que hay que explicar en vez de comprobarla.
   */
  const declaradas = [
    ...new Set(
      [...todo.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/g)].map(
        (m) => m[1],
      ),
    ),
  ];

  it("hay funciones que vigilar", () => {
    // Si esto falla, la expresión de arriba dejó de encontrarlas y las demás
    // comprobaciones estarían pasando sobre una lista vacía.
    expect(declaradas.length).toBeGreaterThan(0);
  });

  /** Los roles que aparecen en los `revoke` que nombran a esta función. */
  function revocadoDe(nombre: string): string {
    return [...todo.matchAll(/revoke\s+[\s\S]*?\s+from\s+([^;]+);/g)]
      .filter((m) => m[0].includes(`function public.${nombre}`))
      .map((m) => m[1])
      .join(" , ");
  }

  // Los dos nombres, y pueden venir en migraciones distintas: las cuatro
  // primeras funciones traían su `from public` de su propia migración y
  // recibieron el `from anon` meses después, en `20260917120000`. Lo que se
  // exige es que entre todas lo digan, no que lo digan de una vez.
  it.each(declaradas)("%s está revocada de public", (nombre) => {
    expect(revocadoDe(nombre)).toMatch(/\bpublic\b/);
  });

  it.each(declaradas)("%s está revocada de anon", (nombre) => {
    expect(revocadoDe(nombre)).toMatch(/\banon\b/);
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
