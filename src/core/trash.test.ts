import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Borrar a una persona y deshacerlo devuelve también sus tareas.
 *
 * La base suelta lo que apuntaba a ella (`on delete set null`): sus tareas
 * quedan «sin asignar» y sus frentes e hitos sin responsable. La papelera
 * guarda qué filas apuntaban y, al restaurar, las vuelve a enlazar -- salvo
 * las que entretanto pasaste a otra persona.
 *
 * Con una base de mentira en memoria; nombres inventados.
 */

type Fila = Record<string, unknown>;

const db = vi.hoisted(() => ({ t: {} as Record<string, Record<string, unknown>[]>, n: 0 }));

const USER = "aaaaaaaa-0000-4000-8000-000000000001";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => ({ id: USER }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabla: string) => {
      const filas = () => (db.t[tabla] ??= []);
      const filtros: ((f: Fila) => boolean)[] = [];
      let accion: { tipo: "select" | "delete" | "update"; valores?: Fila } = { tipo: "select" };
      const ejecutar = () => {
        const elegidas = filas().filter((f) => filtros.every((p) => p(f)));
        if (accion.tipo === "delete") db.t[tabla] = filas().filter((f) => !elegidas.includes(f));
        if (accion.tipo === "update") for (const f of elegidas) Object.assign(f, accion.valores);
        return elegidas;
      };
      const q = {
        select: () => q,
        delete: () => ((accion = { tipo: "delete" }), q),
        update: (valores: Fila) => ((accion = { tipo: "update", valores }), q),
        eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
        in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), q),
        is: (c: string, v: null) => (filtros.push((f) => (f[c] ?? null) === v), q),
        maybeSingle: async () => ({ data: ejecutar()[0] ?? null, error: null }),
        then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: ejecutar(), error: null }).then(ok),
        insert: (nuevas: Fila | Fila[]) => {
          const lista = (Array.isArray(nuevas) ? nuevas : [nuevas]).map((f) => ({ id: f.id ?? `trash-${(db.n += 1)}`, ...f }));
          filas().push(...lista);
          const r = {
            select: () => ({ single: async () => ({ data: lista[0], error: null }) }),
            then: (ok: (x: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
          };
          return r;
        },
      };
      return q;
    },
  }),
}));

import { moveToTrash, restoreFromTrash } from "./trash";

const LUCIA = "00000000-0000-7000-8000-00000000000a";
const TOMAS = "00000000-0000-7000-8000-00000000000b";

beforeEach(() => {
  db.n = 0;
  db.t = {
    core_people: [
      { id: LUCIA, user_id: USER, name: "Lucía" },
      { id: TOMAS, user_id: USER, name: "Tomás" },
    ],
    tasks_project_members: [{ id: "m1", user_id: USER, person_id: LUCIA, project_id: "p1" }],
    tasks_items: [
      { id: "t1", user_id: USER, title: "Planos", assignee_id: LUCIA, parent_id: null },
      { id: "t2", user_id: USER, title: "Permiso", assignee_id: LUCIA, parent_id: null },
      { id: "t3", user_id: USER, title: "Obra", assignee_id: TOMAS, parent_id: null },
    ],
    tasks_milestones: [{ id: "h1", user_id: USER, title: "Proyecto básico", owner_person_id: LUCIA }],
    tasks_streams: [{ id: "f1", user_id: USER, name: "Diseño", lead_person_id: LUCIA }],
    core_trash: [],
  };
});

/** Lo que haría la base al borrar a la persona: soltar lo que apuntaba a ella. */
function soltar(id: string) {
  for (const [tabla, col] of [
    ["tasks_items", "assignee_id"],
    ["tasks_milestones", "owner_person_id"],
    ["tasks_streams", "lead_person_id"],
  ] as const) {
    for (const f of db.t[tabla]) if (f[col] === id) f[col] = null;
  }
  db.t.tasks_project_members = db.t.tasks_project_members.filter((m) => m.person_id !== id);
}

describe("la papelera de una persona", () => {
  it("deshacer devuelve sus tareas, su hito y su frente", async () => {
    const trashId = await moveToTrash("PERSONA", LUCIA);
    expect(trashId).toBeTruthy();
    soltar(LUCIA);
    expect(db.t.tasks_items.filter((t) => t.assignee_id === LUCIA)).toHaveLength(0);

    expect(await restoreFromTrash(trashId!)).toBe(true);
    expect(db.t.tasks_items.filter((t) => t.assignee_id === LUCIA).map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(db.t.tasks_milestones[0].owner_person_id).toBe(LUCIA);
    expect(db.t.tasks_streams[0].lead_person_id).toBe(LUCIA);
    expect(db.t.tasks_project_members.map((m) => m.person_id)).toEqual([LUCIA]);
    // La tarea de Tomás no se toca.
    expect(db.t.tasks_items.find((t) => t.id === "t3")?.assignee_id).toBe(TOMAS);
  });

  it("lo que entretanto pasaste a otra persona se queda con la otra", async () => {
    const trashId = await moveToTrash("PERSONA", LUCIA);
    soltar(LUCIA);
    db.t.tasks_items.find((t) => t.id === "t2")!.assignee_id = TOMAS;
    await restoreFromTrash(trashId!);
    expect(db.t.tasks_items.find((t) => t.id === "t1")?.assignee_id).toBe(LUCIA);
    expect(db.t.tasks_items.find((t) => t.id === "t2")?.assignee_id).toBe(TOMAS);
  });
});
