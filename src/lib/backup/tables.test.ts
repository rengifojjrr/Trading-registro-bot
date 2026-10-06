import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ESSENTIAL_TABLES, IRREPLACEABLE_TABLES } from "./shape";
import { BACKUP_TABLES, NOT_IN_BACKUP } from "./tables";

/**
 * Ninguna tabla con `user_id` se queda sin decidir.
 *
 * La copia programada se quedó atrás dos veces (los siete de vida y después
 * las ocho de los proyectos), y las dos veces la comprobación de Ajustes decía
 * «se puede restaurar». Esto lee las migraciones: cada `create table` con
 * `user_id` tiene que estar en la copia o en la lista de lo que no entra, con
 * su porqué.
 */

const DIRECTORIO = join(process.cwd(), "supabase/migrations");

function tablasConUsuario(): string[] {
  const tablas = new Set<string>();
  for (const fichero of readdirSync(DIRECTORIO).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(DIRECTORIO, fichero), "utf8").replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, " ");
    for (const m of sql.matchAll(/create table(?: if not exists)?\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      if (/^\s*user_id\s/m.test(m[2])) tablas.add(m[1]);
    }
    for (const m of sql.matchAll(/alter table\s+(?:public\.)?(\w+)\s+add column(?: if not exists)?\s+user_id\b/gi)) {
      tablas.add(m[1]);
    }
  }
  return [...tablas].sort();
}

describe("la copia de seguridad no olvida tablas", () => {
  const tablas = tablasConUsuario();
  const enLaCopia = new Set<string>(BACKUP_TABLES);

  it("encuentra las tablas de las migraciones", () => {
    // Si la expresión dejara de encontrarlas, todo lo demás pasaría sobre nada.
    expect(tablas.length).toBeGreaterThan(70);
    expect(tablas).toContain("core_people");
    expect(tablas).toContain("tasks_project_doc_versions");
  });

  it.each(tablas)("%s está en la copia o dice por qué no", (tabla) => {
    expect(enLaCopia.has(tabla) || tabla in NOT_IN_BACKUP).toBe(true);
  });

  it("ninguna está a la vez dentro y fuera", () => {
    expect(BACKUP_TABLES.filter((t) => t in NOT_IN_BACKUP)).toEqual([]);
  });

  it("no hay tablas inventadas en ninguna de las dos listas", () => {
    const existen = new Set(tablas);
    expect(BACKUP_TABLES.filter((t) => !existen.has(t))).toEqual([]);
    expect(Object.keys(NOT_IN_BACKUP).filter((t) => !existen.has(t))).toEqual([]);
  });

  it("lo que la comprobación de Ajustes da por irreemplazable se copia de verdad", () => {
    // `products` no tiene user_id: la ruta la copia aparte.
    const comprobadas = [...ESSENTIAL_TABLES, ...IRREPLACEABLE_TABLES].filter((t) => t !== "products");
    expect(comprobadas.filter((t) => !enLaCopia.has(t))).toEqual([]);
  });

  it("los proyectos de verdad entran enteros, en la copia y en la comprobación", () => {
    const proyectos = [
      "core_people",
      "tasks_projects",
      "tasks_items",
      "tasks_streams",
      "tasks_milestones",
      "tasks_project_members",
      "tasks_project_log",
      "tasks_project_docs",
      "tasks_project_doc_versions",
      "tasks_project_sources",
    ];
    for (const t of proyectos) {
      expect(enLaCopia.has(t), t).toBe(true);
      expect((IRREPLACEABLE_TABLES as readonly string[]).includes(t), t).toBe(true);
    }
  });

  it("lo que se apunta va antes de lo que apunta (orden de restaurar)", () => {
    const pos = (t: string) => BACKUP_TABLES.indexOf(t as (typeof BACKUP_TABLES)[number]);
    expect(pos("core_people")).toBeLessThan(pos("tasks_items"));
    expect(pos("tasks_streams")).toBeLessThan(pos("tasks_items"));
    expect(pos("tasks_milestones")).toBeLessThan(pos("tasks_items"));
    expect(pos("tasks_projects")).toBeLessThan(pos("tasks_streams"));
    expect(pos("tasks_project_docs")).toBeLessThan(pos("tasks_project_doc_versions"));
    expect(pos("bots")).toBeLessThan(pos("paper_accounts"));
  });

  it("la ruta del respaldo usa esta lista", () => {
    const ruta = readFileSync(join(process.cwd(), "src/app/api/cron/backup/route.ts"), "utf8");
    expect(ruta).toMatch(/import \{ BACKUP_TABLES \} from "@\/lib\/backup\/tables"/);
    expect(ruta).toMatch(/for \(const table of TABLES\)/);
    expect(ruta).toMatch(/const TABLES = BACKUP_TABLES;/);
  });
});
