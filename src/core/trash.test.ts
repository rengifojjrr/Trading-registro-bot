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

describe("la papelera de un proyecto", () => {
  const P = "00000000-0000-7000-8000-0000000000e1";

  beforeEach(() => {
    db.t.tasks_projects = [{ id: P, user_id: USER, name: "Finca inventada" }];
    db.t.tasks_milestones = [
      { id: "e1", user_id: USER, project_id: P, kind: "ETAPA", title: "Etapa uno", stage_id: null },
      { id: "h2", user_id: USER, project_id: P, kind: "HITO", title: "Planos", stage_id: "e1" },
    ];
    db.t.tasks_streams = [{ id: "f2", user_id: USER, project_id: P, name: "Obra" }];
    db.t.tasks_project_members = [{ id: "m2", user_id: USER, project_id: P, person_id: LUCIA }];
    db.t.tasks_project_log = [];
    db.t.tasks_project_docs = [];
    db.t.tasks_project_sources = [];
    db.t.tasks_items = [
      { id: "t1", user_id: USER, title: "Pedir planos", project_id: P, milestone_id: "h2", stream_id: "f2" },
      { id: "t2", user_id: USER, title: "Licencia", project_id: P, milestone_id: null, stream_id: "f2" },
      { id: "t3", user_id: USER, title: "Suelta", project_id: null, milestone_id: null, stream_id: null },
    ];
  });

  /** Lo que haría la base al borrar el proyecto: cascada a sus hijos y soltar las tareas. */
  function borrarProyecto() {
    for (const t of db.t.tasks_items) {
      if (t.project_id === P) t.project_id = null;
      if (t.milestone_id === "h2" || t.milestone_id === "e1") t.milestone_id = null;
      if (t.stream_id === "f2") t.stream_id = null;
    }
    for (const tabla of ["tasks_milestones", "tasks_streams", "tasks_project_members"]) {
      db.t[tabla] = db.t[tabla].filter((f) => f.project_id !== P);
    }
  }

  it("deshacer devuelve las tareas a su proyecto, a su hito y a su frente", async () => {
    const trashId = await moveToTrash("PROYECTO", P);
    expect(trashId).toBeTruthy();
    borrarProyecto();
    expect(db.t.tasks_items.filter((t) => t.project_id === P)).toHaveLength(0);

    expect(await restoreFromTrash(trashId!)).toBe(true);
    const t1 = db.t.tasks_items.find((t) => t.id === "t1")!;
    const t2 = db.t.tasks_items.find((t) => t.id === "t2")!;
    expect([t1.project_id, t1.milestone_id, t1.stream_id]).toEqual([P, "h2", "f2"]);
    expect([t2.project_id, t2.milestone_id, t2.stream_id]).toEqual([P, null, "f2"]);
    // La que no era del proyecto no se toca.
    expect(db.t.tasks_items.find((t) => t.id === "t3")?.project_id).toBeNull();
    expect(db.t.tasks_milestones.map((m) => m.id).sort()).toEqual(["e1", "h2"]);
  });

  it("lo que entretanto moviste a otro proyecto se queda donde lo pusiste", async () => {
    const trashId = await moveToTrash("PROYECTO", P);
    borrarProyecto();
    db.t.tasks_items.find((t) => t.id === "t2")!.project_id = "otro";
    await restoreFromTrash(trashId!);
    expect(db.t.tasks_items.find((t) => t.id === "t2")?.project_id).toBe("otro");
    expect(db.t.tasks_items.find((t) => t.id === "t1")?.project_id).toBe(P);
  });

  it("un enlace guardado que no es de la entidad no se aplica", async () => {
    const trashId = await moveToTrash("PROYECTO", P);
    borrarProyecto();
    const entrada = db.t.core_trash.find((e) => e.id === trashId)!;
    const payload = entrada.payload as { relinks: { table: string; column: string; ids: string[]; target?: string }[] };
    // Alguien tocó la papelera para colgar una tarea de un hito que no vuelve.
    payload.relinks.push({ table: "tasks_items", column: "milestone_id", ids: ["t3"], target: "hito-ajeno" });
    payload.relinks.push({ table: "tasks_items", column: "assignee_id", ids: ["t3"] });
    await restoreFromTrash(trashId!);
    const t3 = db.t.tasks_items.find((t) => t.id === "t3")!;
    expect(t3.milestone_id).toBeNull();
    expect(t3.assignee_id).toBeUndefined();
  });
});
