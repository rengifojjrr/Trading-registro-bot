import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aplicar una importación: sólo si el plan es el que viste.
 *
 * «Así lo entendí» es una promesa: lo que se enseña es lo que se hace. Si la
 * base cambió entre el plan y el «Crear» (otra pestaña, el bot, un segundo
 * clic con un archivo distinto), la huella ya no coincide y no se escribe
 * nada: vuelve el plan nuevo para mirarlo otra vez.
 *
 * Con una base de mentira en memoria; nombres inventados.
 */

type Fila = Record<string, unknown>;

const base = vi.hoisted(() => ({
  tablas: {} as Record<string, Record<string, unknown>[]>,
  escrituras: [] as { tabla: string; tipo: string; datos: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => ({ id: "aaaaaaaa-0000-4000-8000-000000000001" }) }));
vi.mock("@/core/user-settings", () => ({ userTimezone: async () => "Europe/Madrid" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabla: string) => {
      const filtros: [string, unknown][] = [];
      const filas = () =>
        (base.tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => (f as Fila)[c] === v));
      const consulta = {
        select: () => consulta,
        eq: (c: string, v: unknown) => {
          filtros.push([c, v]);
          return consulta;
        },
        in: () => consulta,
        order: () => consulta,
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: filas(), error: null }).then(ok),
        upsert: async (datos: unknown) => {
          base.escrituras.push({ tabla, tipo: "upsert", datos });
          return { error: null };
        },
        update: (datos: unknown) => {
          const fin = { eq: () => fin, then: (ok: (r: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok) };
          base.escrituras.push({ tabla, tipo: "update", datos });
          return fin;
        },
      };
      return consulta;
    },
  }),
}));

import { leerArchivoProyecto } from "./domain/project-file";
import { applyProjectImport, planProjectImport } from "./project-actions";

const ARCHIVO = `---
proyecto: Huerto del patio
---
## Personas
| Persona | Papel |
|---|---|
| Yo | Coordinador |
| Marta | Vecina |

## Tareas
- [ ] Comprar tierra — @Marta
`;

function archivo() {
  let n = 0;
  const r = leerArchivoProyecto(ARCHIVO, {
    hoy: "2026-10-06",
    nuevoId: () => `0000000${(n += 1) % 10}-0000-7000-8000-${String(n).padStart(12, "0")}`,
  });
  if (!r.ok) throw new Error(r.error);
  return r.archivo;
}

beforeEach(() => {
  base.tablas = { tasks_projects: [], core_people: [] };
  base.escrituras = [];
});

describe("applyProjectImport", () => {
  it("con la huella que se enseñó, escribe", async () => {
    const a = archivo();
    const { plan } = await planProjectImport(a);
    expect(plan?.huella).toMatch(/^[0-9a-f]{16}$/);
    const r = await applyProjectImport(a, plan!.huella);
    expect(r).toMatchObject({ error: null, cambiado: false });
    expect(base.escrituras.length).toBeGreaterThan(0);
  });

  it("con una huella vieja no escribe nada y devuelve el plan nuevo", async () => {
    const a = archivo();
    const r = await applyProjectImport(a, "0123456789abcdef");
    expect(r.cambiado).toBe(true);
    expect(r.plan?.lineas[0]).toContain("Huerto del patio");
    expect(base.escrituras).toEqual([]);
  });

  it("si la base cambió entre el plan y el «Crear», tampoco", async () => {
    const a = archivo();
    const { plan } = await planProjectImport(a);
    // Entretanto, alguien creó a Marta en otra pestaña.
    base.tablas.core_people.push({
      id: "bbbbbbbb-0000-7000-8000-000000000001",
      user_id: "aaaaaaaa-0000-4000-8000-000000000001",
      name: "Marta",
      aliases: [],
      is_owner: false,
      archived_at: null,
      relation: null,
      note: null,
      whatsapp_hint: null,
      field_src: {},
    });
    const r = await applyProjectImport(a, plan!.huella);
    expect(r.cambiado).toBe(true);
    expect(base.escrituras).toEqual([]);
  });

  it("lo que no es un archivo válido no llega a la base", async () => {
    const r = await applyProjectImport({ nombre: "x" }, "0123456789abcdef");
    expect(r.error).toContain("forma esperada");
    expect(base.escrituras).toEqual([]);
  });
});
