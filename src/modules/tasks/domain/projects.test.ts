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

// ---------------------------------------------------------------------------
// Lo que se calcula de un proyecto sin guardarlo.

import {
  computeHealth,
  freeSlug,
  nextUp,
  compareProjectTasks,
  humanSourceLabel,
  originOf,
  progressOf,
  progressLabel,
  slugify,
  waitingLabel,
  waitingOnOthers,
  type HealthInput,
  type ProjectMilestoneFacts,
  type ProjectTaskFacts,
} from "./projects";

const HOY_P = "2026-10-06";
const YO = "yo-0000";
const LUCIA = "lucia-0000";

function tarea(extra: Partial<ProjectTaskFacts> = {}): ProjectTaskFacts {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Una tarea",
    status: "NO_INICIADA",
    priority: "MEDIA",
    dueDate: null,
    assigneeId: YO,
    milestoneId: null,
    parentId: null,
    createdOn: "2026-10-05",
    completedOn: null,
    ...extra,
  };
}

function hito(extra: Partial<ProjectMilestoneFacts> = {}): ProjectMilestoneFacts {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "HITO",
    title: "Un hito",
    dueOn: null,
    status: "PENDIENTE",
    updatedOn: "2026-10-05",
    ...extra,
  };
}

function salud(extra: Partial<HealthInput> = {}) {
  return computeHealth({
    status: "EN_MARCHA",
    health: null,
    healthUntil: null,
    tasks: [],
    milestones: [],
    log: [{ on: "2026-10-05", auto: false }],
    ownerId: YO,
    names: { [LUCIA]: "Lucía" },
    today: HOY_P,
    now: "2026-10-06T12:00:00Z",
    createdOn: "2026-09-01",
    ...extra,
  });
}

describe("el semáforo", () => {
  it("verde cuando no hay nada que decir", () => {
    expect(salud({ tasks: [tarea()] })).toMatchObject({ level: "VERDE", why: "Va bien", manual: false });
  });

  it("un proyecto vacío no va «bien»: aún no tiene plan", () => {
    expect(salud()).toMatchObject({ level: null, why: "Aún sin plan" });
    expect(salud({ milestones: [hito()] })).toMatchObject({ level: "VERDE" });
  });

  it("rojo: atascado", () => {
    expect(salud({ status: "ATASCADO" })).toMatchObject({ level: "ROJO", why: "Está atascado" });
  });

  it("rojo: un hito con la fecha pasada sin hacer", () => {
    const r = salud({ milestones: [hito({ title: "Permiso", dueOn: "2026-10-01" })] });
    expect(r).toMatchObject({ level: "ROJO", why: "El hito «Permiso» pasó de fecha" });
  });

  it("un hito pasado pero hecho o saltado no cuenta", () => {
    expect(salud({ milestones: [hito({ dueOn: "2026-10-01", status: "HECHO" })] }).level).toBe("VERDE");
    expect(salud({ milestones: [hito({ dueOn: "2026-10-01", status: "SALTADO" })] }).level).toBe("VERDE");
  });

  it("rojo con tres atrasadas, y dice de quién si son de una sola persona", () => {
    const tres = [1, 2, 3].map(() => tarea({ dueDate: "2026-10-01", assigneeId: LUCIA }));
    expect(salud({ tasks: tres })).toMatchObject({ level: "ROJO", why: "3 tareas atrasadas de Lucía" });
  });

  it("amarillo con una o dos atrasadas", () => {
    expect(salud({ tasks: [tarea({ dueDate: "2026-10-01" })] })).toMatchObject({ level: "AMARILLO", why: "1 tarea atrasada" });
  });

  it("las subtareas no cuentan dos veces", () => {
    const madre = tarea({ dueDate: "2026-10-01" });
    const hija = tarea({ dueDate: "2026-10-01", parentId: madre.id });
    expect(salud({ tasks: [madre, hija] }).why).toBe("1 tarea atrasada");
  });

  it("amarillo: algo de otra persona esperando más de siete días", () => {
    const r = salud({ tasks: [tarea({ assigneeId: LUCIA, title: "Planos", createdOn: "2026-09-27" })] });
    expect(r).toMatchObject({ level: "AMARILLO", why: "Lucía lleva 9 días con «Planos»" });
  });

  it("amarillo: un hito en siete días o menos con tareas abiertas", () => {
    const h = hito({ title: "Tejado", dueOn: "2026-10-09" });
    const r = salud({ milestones: [h], tasks: [tarea({ milestoneId: h.id }), tarea({ milestoneId: h.id })] });
    expect(r).toMatchObject({ level: "AMARILLO", why: "«Tejado» es en 3 días y le quedan 2 tareas" });
  });

  it("amarillo: nada nuevo en más de catorce días", () => {
    expect(salud({ log: [{ on: "2026-09-10", auto: false }] })).toMatchObject({ level: "AMARILLO", why: "Nada nuevo en 26 días" });
  });

  it("lo que apunta la app sola no es una novedad", () => {
    expect(salud({ log: [{ on: "2026-09-10", auto: false }, { on: "2026-10-05", auto: true }] }).level).toBe("AMARILLO");
  });

  it("un proyecto recién creado no está «sin novedades»", () => {
    expect(salud({ log: [], createdOn: "2026-10-01", tasks: [tarea()] }).level).toBe("VERDE");
  });

  it("puesto a mano manda catorce días; después se calcula y sugiere revisarlo", () => {
    const tuyo = salud({ health: "ROJO", healthUntil: "2026-10-15T00:00:00Z" });
    expect(tuyo).toMatchObject({ level: "ROJO", manual: true, why: "Lo pusiste tú" });
    const vencido = salud({ health: "ROJO", healthUntil: "2026-10-01T00:00:00Z", tasks: [tarea()] });
    expect(vencido).toMatchObject({ level: "VERDE", manual: false, review: true });
  });

  it("en pausa, terminado o descartado no tiene semáforo", () => {
    for (const status of ["EN_PAUSA", "TERMINADO", "DESCARTADO"] as const) {
      expect(salud({ status }).level).toBeNull();
    }
  });
});

describe("el avance", () => {
  it("cuenta hitos sin los saltados", () => {
    const p = progressOf(
      [hito({ status: "HECHO" }), hito(), hito({ status: "SALTADO" }), { kind: "ETAPA", status: "HECHO" }],
      [],
    );
    expect(p).toEqual({ done: 1, total: 2, unit: "hitos" });
    expect(progressLabel(p)).toBe("1 de 2 hitos");
  });

  it("sin hitos, cuenta tareas sin subtareas", () => {
    const p = progressOf([], [tarea({ status: "HECHA" }), tarea(), tarea({ parentId: "x", status: "HECHA" })]);
    expect(p).toEqual({ done: 1, total: 2, unit: "tareas" });
  });
});

describe("lo próximo", () => {
  it("por fecha y, en empate, por prioridad; lo atrasado primero y lo sin fecha fuera", () => {
    const items = nextUp(
      [
        tarea({ title: "Sin fecha" }),
        tarea({ title: "Baja", dueDate: "2026-10-09", priority: "BAJA" }),
        tarea({ title: "Alta", dueDate: "2026-10-09", priority: "ALTA" }),
        tarea({ title: "Atrasada", dueDate: "2026-10-01" }),
        tarea({ title: "Hecha", dueDate: "2026-10-02", status: "HECHA" }),
      ],
      [hito({ title: "Tejado", dueOn: "2026-10-20" })],
      4,
    );
    expect(items.map((i) => i.title)).toEqual(["Atrasada", "Alta", "Baja", "Tejado"]);
  });
});

describe("esperando a otros", () => {
  it("por persona, la espera más larga primero; lo tuyo y lo sin asignar no cuentan", () => {
    const w = waitingOnOthers(
      [
        tarea({ assigneeId: LUCIA, createdOn: "2026-09-20", title: "Planos" }),
        tarea({ assigneeId: LUCIA, createdOn: "2026-10-01" }),
        tarea({ assigneeId: "tomas", createdOn: "2026-10-04" }),
        tarea({ assigneeId: YO, createdOn: "2026-01-01" }),
        tarea({ assigneeId: null, createdOn: "2026-01-01" }),
        tarea({ assigneeId: "tomas", createdOn: "2026-01-01", status: "HECHA" }),
      ],
      YO,
      HOY_P,
    );
    expect(w).toEqual([
      { personId: LUCIA, count: 2, days: 16, oldestTitle: "Planos" },
      { personId: "tomas", count: 1, days: 2, oldestTitle: "Una tarea" },
    ]);
  });
});

describe("slug", () => {
  it("sin tildes, eñes ni signos", () => {
    expect(slugify("Casa de Ña Pía · 2027")).toBe("casa-de-na-pia-2027");
    expect(slugify("  ¡Hola!  ")).toBe("hola");
  });

  it("uno libre si ya está cogido", () => {
    expect(freeSlug("Casa", ["casa", "casa-2"])).toBe("casa-3");
    expect(freeSlug("!!!", [])).toBe("proyecto");
  });
});

describe("de dónde salió una tarea", () => {
  it("manda la evidencia si la hay", () => {
    expect(originOf({ origin: "CLAUDE", source_kind: "LLAMADA", source_label: "la llamada con Lucía del 5 oct" })).toEqual({
      key: "LLAMADA",
      text: "Salió de la llamada con Lucía del 5 oct",
    });
  });

  it("si no, el camino por el que entró", () => {
    expect(originOf({ origin: "CLAUDE", source_kind: "CLAUDE", source_label: null }).key).toBe("CLAUDE");
    expect(originOf({ origin: "A_MANO", source_kind: null, source_label: null }).key).toBe("A_MANO");
  });

  it("las de antes: Notion si vinieron de allí, tuyas si no", () => {
    expect(originOf({ origin: null, source_kind: null, source_label: null, notion_page_id: "abc" }).key).toBe("NOTION");
    expect(originOf({ origin: null, source_kind: null, source_label: null, notion_page_id: null }).key).toBe("A_MANO");
  });
});

describe("textos de un vistazo", () => {
  it("cuánto lleva esperando, sin «0 d»", () => {
    expect(waitingLabel(0)).toBe("esperando desde hoy");
    expect(waitingLabel(1)).toBe("esperando 1 día");
    expect(waitingLabel(9)).toBe("esperando 9 días");
  });

  it("el origen con la fecha como la dice la app", () => {
    expect(humanSourceLabel("llamada 2026-09-28", "2026-10-06")).toBe("una llamada del 28 sept");
    expect(humanSourceLabel("reunión del 2026-10-01", "2026-10-06")).toBe("una reunión del 1 oct");
    expect(humanSourceLabel("la llamada con Lucía del 5 oct", "2026-10-06")).toBe("la llamada con Lucía del 5 oct");
    expect(originOf({ origin: "CLAUDE", source_kind: "LLAMADA", source_label: "llamada 2026-09-28" }, "2026-10-06").text).toBe(
      "Salió de una llamada del 28 sept",
    );
  });

  it("una tarea de Notion con el origen por defecto sigue diciendo Notion", () => {
    expect(originOf({ origin: "A_MANO", source_kind: null, source_label: null, notion_page_id: "abc" }).key).toBe("NOTION");
  });

  it("dentro de un grupo, lo vencido primero, luego por fecha y prioridad", () => {
    const hoy = "2026-10-06";
    const t = (due: string | null, priority: "ALTA" | "MEDIA" | "BAJA" = "MEDIA") => ({ due_date: due, priority });
    const lista = [t("2026-11-18"), t(null, "ALTA"), t("2026-10-25"), t("2026-10-01"), t("2026-10-13"), t("2026-10-13", "ALTA")];
    expect([...lista].sort((a, b) => compareProjectTasks(a, b, hoy))).toEqual([
      t("2026-10-01"),
      t("2026-10-13", "ALTA"),
      t("2026-10-13"),
      t("2026-10-25"),
      t("2026-11-18"),
      t(null, "ALTA"),
    ]);
  });
});
