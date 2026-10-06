import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PROJECT_NAME_MAX, projectNameSchema } from "./projects";

describe("el nombre de un proyecto", () => {
  it("acepta de 1 a 60 caracteres, ya recortado", () => {
    expect(projectNameSchema.parse("  Casa  ")).toBe("Casa");
    expect(projectNameSchema.safeParse("a".repeat(60)).success).toBe(true);
    // Los espacios de los bordes no cuentan, como en la base (trim).
    expect(projectNameSchema.safeParse(`  ${"a".repeat(60)}  `).success).toBe(true);
  });

  it("rechaza 61 y dice por qué, en vez de dejar que la base lo tumbe sin explicar", () => {
    const largo = projectNameSchema.safeParse("a".repeat(61));
    expect(largo.success).toBe(false);
    expect(largo.error?.issues[0]?.message).toBe("Máximo 60 caracteres.");
    // Lo que antes pasaba (hasta 120) y luego fallaba en la base.
    expect(projectNameSchema.safeParse("a".repeat(120)).success).toBe(false);
  });

  it("rechaza vacío o sólo espacios", () => {
    expect(projectNameSchema.safeParse("").error?.issues[0]?.message).toBe("Ponle nombre al proyecto.");
    expect(projectNameSchema.safeParse("   ").success).toBe(false);
    expect(projectNameSchema.safeParse(null).success).toBe(false);
  });
});

describe("el tope de la aplicación es el de la base", () => {
  const DIRECTORIO = join(process.cwd(), "supabase/migrations");
  const sql = readdirSync(DIRECTORIO)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(DIRECTORIO, f), "utf8"))
    .join("\n");

  it("tasks_projects.name tiene el mismo largo máximo que PROJECT_NAME_MAX", () => {
    const tabla = sql.match(/create table if not exists public\.tasks_projects \(([\s\S]*?)\n\);/);
    expect(tabla).not.toBeNull();
    const tope = tabla?.[1].match(/name text not null check \(char_length\(trim\(name\)\) between 1 and (\d+)\)/);
    expect(tope?.[1]).toBe(String(PROJECT_NAME_MAX));
  });

  it("ninguna migración posterior cambia el tope del nombre sin que esto se entere", () => {
    // Si una migración nueva toca la restricción del nombre, esta prueba obliga
    // a mirar también PROJECT_NAME_MAX.
    const cambios = sql.match(/alter table public\.tasks_projects[^;]*name[^;]*char_length[^;]*;/gi) ?? [];
    expect(cambios).toEqual([]);
  });

  it("createProject valida con este esquema y no con otro tope escrito a mano", () => {
    const acciones = readFileSync(join(process.cwd(), "src/modules/tasks/actions.ts"), "utf8");
    const cuerpo = acciones.match(/export async function createProject\([\s\S]*?\n}\n/)?.[0] ?? "";
    expect(cuerpo).toContain("projectNameSchema.safeParse(");
    expect(cuerpo).not.toMatch(/\.max\(\d+/);
  });
});
