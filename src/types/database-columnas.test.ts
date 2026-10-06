import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Los tipos de la base están escritos a mano (`database.ts`). Si una migración
 * añade una columna y aquí no se añade, el código no la ve -- o peor, cree que
 * existe una que no está.
 *
 * Esta prueba lee la migración de los proyectos de verdad y comprueba que cada
 * columna que crea está en el tipo de su tabla. Empieza por las tablas de esa
 * migración; las de antes no tienen esta red.
 */

const MIGRACION = "supabase/migrations/20261006120000_proyectos_de_verdad.sql";

const sql = readFileSync(join(process.cwd(), MIGRACION), "utf8").replace(/--[^\n]*/g, "");
const tipos = readFileSync(join(process.cwd(), "src/types/database.ts"), "utf8");

/** Las columnas que la migración declara, por tabla. */
function columnasDeLaMigracion(): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const m of sql.matchAll(/create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    const columnas = m[2]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[a-z_]+ (uuid|text|integer|boolean|date|timestamptz|jsonb|smallint|bigint)/.test(l))
      .map((l) => l.split(" ")[0]);
    mapa.set(m[1], columnas);
  }
  for (const m of sql.matchAll(/alter table public\.(\w+)\s+(add column[^;]*);/g)) {
    const columnas = [...m[2].matchAll(/add column if not exists (\w+)/g)].map((x) => x[1]);
    mapa.set(m[1], [...(mapa.get(m[1]) ?? []), ...columnas]);
  }
  return mapa;
}

/** Las claves de `Row` de una tabla en database.ts. */
function columnasDelTipo(tabla: string): string[] | null {
  const inicio = tipos.indexOf(`      ${tabla}: Table<`);
  if (inicio < 0) return null;
  const abre = tipos.indexOf("{", inicio);
  let profundidad = 0;
  let fin = abre;
  for (let i = abre; i < tipos.length; i += 1) {
    if (tipos[i] === "{") profundidad += 1;
    if (tipos[i] === "}") profundidad -= 1;
    if (profundidad === 0) {
      fin = i;
      break;
    }
  }
  return [...tipos.slice(abre, fin).matchAll(/^ {10}(\w+)\??:/gm)].map((m) => m[1]);
}

describe("database.ts tiene las columnas de la migración de proyectos", () => {
  const mapa = columnasDeLaMigracion();

  it("encuentra las tablas", () => {
    expect([...mapa.keys()].sort()).toEqual(
      [
        "core_people",
        "tasks_items",
        "tasks_milestones",
        "tasks_project_doc_versions",
        "tasks_project_docs",
        "tasks_project_log",
        "tasks_project_members",
        "tasks_project_sources",
        "tasks_projects",
        "tasks_streams",
      ].sort(),
    );
  });

  it("lee también las columnas que crecen en las tablas de antes", () => {
    expect(mapa.get("tasks_projects")).toEqual(expect.arrayContaining(["slug", "status", "how_md", "field_src", "updated_at"]));
    expect(mapa.get("tasks_items")).toEqual(expect.arrayContaining(["assignee_id", "origin", "field_src", "version"]));
  });

  it.each([...mapa.entries()])("%s", (tabla, columnas) => {
    const declaradas = columnasDelTipo(tabla);
    expect(declaradas, `${tabla} no está en database.ts`).not.toBeNull();
    expect(columnas.length).toBeGreaterThan(0);
    const faltan = columnas.filter((c) => !declaradas!.includes(c));
    expect(faltan, `${tabla}: faltan en database.ts`).toEqual([]);
  });
});
