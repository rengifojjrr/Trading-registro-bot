import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ENTIDADES, FUNCIONES_DEL_PUENTE, NOMBRES_DE_ENTIDAD, recortarFila, TABLAS_DEL_PUENTE } from "./tablas";

/**
 * La lista blanca, comprobada leyendo el código (al estilo de
 * `permisos-sql.test.ts`).
 *
 * Las rutas del puente usan la clave de servicio: se saltan todas las RLS. Lo
 * único que impide que un fallo aquí lea el trading o el sueño es que el
 * código sólo nombre tablas de la lista. Esta prueba lee cada archivo de
 * `src/lib/puente/**` y `src/app/api/puente/**` (y lo que el puente usa del
 * módulo de tareas para importar) y falla si aparece una tabla o una función
 * de fuera, SQL libre o un cliente con la sesión del navegador.
 */

const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const camino = join(dir, nombre);
    if (statSync(camino).isDirectory()) return nombre === "__pruebas__" ? [] : archivos(camino);
    return /\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [camino] : [];
  });
}

const DEL_PUENTE = [...archivos(join(RAIZ, "src/lib/puente")), ...archivos(join(RAIZ, "src/app/api/puente"))];
// Lo que el puente llama para importar un proyecto: también corre con la clave de servicio.
const DEL_IMPORTADOR = [join(RAIZ, "src/modules/tasks/project-io.ts")];

const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");

const permitidas = new Set<string>(TABLAS_DEL_PUENTE);

describe("la lista blanca del puente", () => {
  it("hay archivos que vigilar", () => {
    expect(DEL_PUENTE.length).toBeGreaterThanOrEqual(10);
  });

  it.each([...DEL_PUENTE, ...DEL_IMPORTADOR].map((f) => [f.slice(RAIZ.length + 1), f]))(
    "%s sólo nombra tablas de la lista",
    (_nombre, fichero) => {
      const codigo = sinComentarios(readFileSync(fichero, "utf8"));
      // `Buffer.from` y `Array.from` no son tablas.
      for (const [, argumento] of codigo.matchAll(/(?<!Buffer|Array)\.from\(\s*(tablaDe\(entidad\)|[^)]*?)\s*\)/g)) {
        const literal = /^"([a-z_]+)"$/.exec(argumento);
        if (literal) {
          expect(permitidas.has(literal[1]), `${literal[1]} no está en la lista`).toBe(true);
          continue;
        }
        // Una tabla que sólo se conoce al ejecutar sale de una de estas dos
        // expresiones, y las dos devuelven tablas de la lista por su tipo.
        expect(["tablaDe(entidad)", "lote.tabla"], `.from(${argumento})`).toContain(argumento);
      }
    },
  );

  it.each(DEL_PUENTE.map((f) => [f.slice(RAIZ.length + 1), f]))("%s sólo llama a funciones de la lista", (_n, fichero) => {
    const codigo = sinComentarios(readFileSync(fichero, "utf8"));
    for (const [, nombre] of codigo.matchAll(/\.rpc\(\s*"([^"]+)"/g)) {
      expect(FUNCIONES_DEL_PUENTE as readonly string[]).toContain(nombre);
    }
    // `.rpc(` siempre con un nombre literal.
    expect(codigo.match(/\.rpc\(\s*[^"\s]/g)).toBeNull();
  });

  it.each(DEL_PUENTE.map((f) => [f.slice(RAIZ.length + 1), f]))("%s no lleva SQL libre ni la sesión del navegador", (_n, fichero) => {
    const codigo = sinComentarios(readFileSync(fichero, "utf8"));
    expect(codigo).not.toMatch(/from\s+["']postgres["']|from\s+["']pg["']/);
    expect(codigo).not.toMatch(/\.(query|sql)\s*\(/);
    expect(codigo).not.toMatch(/@\/lib\/supabase\/(server|client)["']/);
    expect(codigo).not.toMatch(/console\.(log|info|debug|warn|error)\(/);
  });

  it("las tablas que escribe el importador están en la lista", () => {
    const tipo = readFileSync(join(RAIZ, "src/modules/tasks/domain/project-import.ts"), "utf8");
    const union = /export type Tabla =([\s\S]*?);/.exec(tipo)?.[1] ?? "";
    const tablas = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(tablas.length).toBeGreaterThan(5);
    for (const t of tablas) expect(permitidas.has(t), t).toBe(true);
  });

  it("cada entidad del feed sale de una tabla de la lista", () => {
    for (const e of NOMBRES_DE_ENTIDAD) expect(permitidas.has(ENTIDADES[e].tabla), e).toBe(true);
  });

  it("ninguna columna del feed es un secreto ni un texto largo", () => {
    const prohibidas = ["notes", "description", "body", "body_md", "note", "phone_tail", "sal", "huella", "field_src", "payload"];
    for (const e of NOMBRES_DE_ENTIDAD) {
      for (const c of prohibidas) expect(ENTIDADES[e].columnas as readonly string[], `${e}.${c}`).not.toContain(c);
    }
  });
});

describe("la base y la lista dicen lo mismo", () => {
  const migracion = readFileSync(join(RAIZ, "supabase/migrations/20261006200000_el_puente_con_el_bot.sql"), "utf8");

  it("el feed admite exactamente las entidades de la lista", () => {
    const check = /entidad text not null check \(entidad in \(([\s\S]*?)\)\)/.exec(migracion)?.[1] ?? "";
    const enLaBase = [...check.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(enLaBase).toEqual([...NOMBRES_DE_ENTIDAD].sort());
  });

  it("los disparadores vigilan la tabla de cada entidad", () => {
    const pares = [...migracion.matchAll(/\['([a-z_]+)', '([a-z]+)'\]/g)].map((m) => [m[2], m[1]]);
    expect(Object.fromEntries(pares)).toEqual(
      Object.fromEntries(NOMBRES_DE_ENTIDAD.map((e) => [e, ENTIDADES[e].tabla])),
    );
  });
});

describe("recortarFila", () => {
  it("deja sólo las columnas de la lista, aunque la base mande más", () => {
    const fila = recortarFila("tarea", {
      id: "x",
      title: "Una tarea",
      notes: "una nota larga del dueño",
      description: "secreto",
      user_id: "u",
    });
    expect(Object.keys(fila)).toEqual([...ENTIDADES.tarea.columnas]);
    expect(fila).not.toHaveProperty("notes");
    expect(fila).not.toHaveProperty("user_id");
    expect(fila.title).toBe("Una tarea");
    expect(fila.due_date).toBeNull();
  });
});
