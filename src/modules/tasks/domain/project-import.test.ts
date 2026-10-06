import { describe, expect, it } from "vitest";

import type { FieldSrc } from "@/types/database";

import { leerArchivoProyecto, type ArchivoProyecto } from "./project-file";
import {
  encontrarProyecto,
  huellaDe,
  planearImportacion,
  type EstadoParaImportar,
  type Op,
  type Plan,
} from "./project-import";

/**
 * El plan de importar un archivo de proyecto.
 *
 * Se prueba contra una base de mentira en memoria: se aplican las operaciones
 * del plan sobre ella y se vuelve a planear. Lo que tiene que salir de ahí son
 * las tres reglas: nunca borra, nunca pisa lo tuyo, y lo hecho no se reabre.
 * Y que repetir no duplica.
 *
 * Nombres inventados; el repositorio es público.
 */

const AHORA = "2026-10-06T15:00:00Z";
const HOY = "2026-10-06";

function contador(prefijo = "0") {
  let n = 0;
  return () => {
    n += 1;
    return `${prefijo.repeat(8)}-0000-7000-8000-${String(n).padStart(12, "0")}`;
  };
}

function leer(texto: string, prefijo = "0"): ArchivoProyecto {
  const r = leerArchivoProyecto(texto, { nuevoId: contador(prefijo), hoy: HOY });
  if (!r.ok) throw new Error(r.error);
  return r.archivo;
}

const VACIO: EstadoParaImportar = {
  proyectos: [],
  proyecto: null,
  personas: [],
  miembros: [],
  frentes: [],
  hitos: [],
  tareas: [],
  bitacora: [],
  enlaces: [],
  ficha: null,
};

const ARCHIVO = `---
proyecto: Finca El Roble
alias: [finca]
estado: en marcha
objetivo: Alquilarla en primavera
meta: 2027-03-31
---
## Cómo va
Esperando el presupuesto.

## Ficha técnica
| Dato | Valor |
|---|---|
| Hectáreas | 3 |

## Personas
| Persona | Papel | Lado | Qué hace | WhatsApp |
|---|---|---|---|---|
| Yo | Coordinador | nosotros | todo | — |
| Lucía | Arquitecta | nosotros | planos | sí |
| Tomás | Contratista | contraparte | la obra | no |

## Frentes
- Obra (Tomás) · Permisos (Lucía)

## Hoja de ruta
### Etapa 1 — Arreglos (2026-10-01 → 2026-12-15)
- [x] Primera visita — 2026-10-05
- [ ] Tejado nuevo — @Tomás — 2026-11-30

## Tareas
- [ ] Llamar a la abogada — @yo — 2026-10-09
- [ ] Mandar el presupuesto — @Tomás — 2026-10-15 — #Obra — (llamada 2026-10-05)
  - [ ] Pedir tres precios — @Tomás
- [x] Presentarme con Tomás — @yo
- [ ] Revisar el pozo — @Inés

## Recordatorios
- todos los días 08:00 — Mirar el tiempo

## Bitácora
- 2026-10-05 — decisión — Sin permiso no hay obra.

## Enlaces
- Planos — https://ejemplo.test/planos.pdf
`;

/**
 * Una base de mentira: aplica las operaciones de un plan y devuelve el estado
 * que vería el siguiente plan. Hace lo mismo que la base de verdad con las
 * columnas que el plan mira, y nada más.
 */
function aplicar(estado: EstadoParaImportar, plan: Plan): EstadoParaImportar {
  const e: EstadoParaImportar = structuredClone(estado);
  for (const op of plan.ops) {
    const datos = op.accion === "crear" ? op.fila : op.cambios;
    const src = (datos.field_src as FieldSrc | undefined) ?? {};
    const lista = (() => {
      switch (op.tabla) {
        case "core_people":
          return e.personas as unknown as Record<string, unknown>[];
        case "tasks_project_members":
          return e.miembros as unknown as Record<string, unknown>[];
        case "tasks_streams":
          return e.frentes as unknown as Record<string, unknown>[];
        case "tasks_milestones":
          return e.hitos as unknown as Record<string, unknown>[];
        case "tasks_items":
          return e.tareas as unknown as Record<string, unknown>[];
        case "tasks_project_log":
          return e.bitacora as unknown as Record<string, unknown>[];
        case "tasks_project_sources":
          return e.enlaces as unknown as Record<string, unknown>[];
        default:
          return null;
      }
    })();

    if (op.tabla === "tasks_projects") {
      if (op.accion === "crear") {
        const p = op.fila;
        e.proyectos.push({ id: op.id, name: String(p.name), slug: (p.slug as string) ?? null });
        e.proyecto = {
          id: op.id,
          name: String(p.name),
          slug: (p.slug as string) ?? null,
          aliases: (p.aliases as string[]) ?? [],
          status: (p.status as never) ?? "EN_MARCHA",
          objective: (p.objective as string) ?? null,
          how_md: (p.how_md as string) ?? null,
          how_by: (p.how_by as never) ?? null,
          started_on: (p.started_on as string) ?? null,
          target_on: (p.target_on as string) ?? null,
          color: (p.color as never) ?? null,
          icon: (p.icon as string) ?? null,
          cloud_level: "COMPLETA",
          field_src: src,
        };
      } else if (e.proyecto) {
        Object.assign(e.proyecto, op.cambios);
      }
      continue;
    }

    if (op.tabla === "tasks_project_docs") {
      if (op.accion === "crear") {
        e.ficha = { id: op.id, body_md: String(op.fila.body_md), made_by: op.fila.made_by as never };
      } else if (e.ficha) {
        Object.assign(e.ficha, op.cambios);
      }
      continue;
    }

    if (!lista) continue;
    if (op.accion === "crear") {
      const fila: Record<string, unknown> = {
        // Los valores por defecto de la base que el plan mira.
        aliases: [],
        is_owner: false,
        archived_at: null,
        relation: null,
        note: null,
        whatsapp_hint: null,
        role: null,
        does_md: null,
        side: null,
        lead_person_id: null,
        stage_id: null,
        starts_on: null,
        due_on: null,
        due_precision: "DIA",
        status: op.tabla === "tasks_milestones" ? "PENDIENTE" : "NO_INICIADA",
        owner_person_id: null,
        detail: null,
        due_date: null,
        priority: "MEDIA",
        assignee_id: null,
        stream_id: null,
        parent_id: null,
        notes: null,
        ref: null,
        field_src: {},
        ...op.fila,
      };
      if (op.tabla === "tasks_project_log") fila.title = op.fila.title;
      if (op.tabla === "tasks_project_sources") fila.label = op.fila.label;
      expect(lista.some((x) => x.id === op.id), `${op.tabla} ${op.id} creada dos veces`).toBe(false);
      lista.push(fila);
    } else {
      const fila = lista.find((x) => x.id === op.id);
      expect(fila, `${op.tabla} ${op.id} no existe`).toBeTruthy();
      Object.assign(fila!, op.cambios);
    }
  }
  return e;
}

function tablas(ops: Op[], accion: "crear" | "cambiar") {
  return ops.filter((o) => o.accion === accion).map((o) => o.tabla);
}

describe("un proyecto nuevo", () => {
  const archivo = leer(ARCHIVO);
  const plan = planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY });

  it("«Así lo entendí»: lo que va a crear, en palabras", () => {
    expect(plan.bloqueo).toBeNull();
    expect(plan.nuevo).toBe(true);
    expect(plan.lineas[0]).toBe("Finca El Roble (nuevo)");
    expect(plan.lineas).toContain("Personas: 4 (3 nuevas: Lucía, Tomás, Inés)");
    expect(plan.lineas).toContain(
      "Frentes: 2 · Etapas: 1 · Hitos: 2 · Tareas: 5 (1 hecha) · Bitácora: 1 · Enlaces: 1",
    );
    expect(plan.lineas).toContain("Ficha técnica: nueva");
    expect(plan.lineas.join("\n")).toContain("Recordatorios: 1 (no se cargan todavía");
    expect(plan.lineas).toContain("Cambia: nada · Se borra: nada");
  });

  it("sólo crea: ni un cambio ni un borrado", () => {
    expect(tablas(plan.ops, "cambiar")).toEqual([]);
    expect(plan.ops.every((o) => o.accion === "crear")).toBe(true);
  });

  it("en orden: las personas y el proyecto antes que lo que cuelga de ellos", () => {
    const orden = plan.ops.map((o) => o.tabla);
    const primero = (t: string) => orden.indexOf(t as never);
    expect(primero("core_people")).toBeLessThan(primero("tasks_projects"));
    expect(primero("tasks_projects")).toBeLessThan(primero("tasks_project_members"));
    expect(primero("tasks_projects")).toBeLessThan(primero("tasks_items"));
    // La tarea madre va antes que su subtarea.
    const tareas = plan.ops.filter((o) => o.tabla === "tasks_items" && o.accion === "crear") as Extract<Op, { accion: "crear" }>[];
    const sub = tareas.find((t) => t.fila.title === "Pedir tres precios")!;
    const madre = tareas.findIndex((t) => t.id === sub.fila.parent_id);
    expect(madre).toBeGreaterThanOrEqual(0);
    expect(madre).toBeLessThan(tareas.indexOf(sub));
  });

  it("los ids son los que nacieron en el navegador", () => {
    const proyecto = plan.ops.find((o) => o.tabla === "tasks_projects")!;
    expect(proyecto.id).toBe(archivo.nuevoId);
    const tarea = plan.ops.find((o) => o.tabla === "tasks_items" && o.accion === "crear" && o.fila.title === "Llamar a la abogada")!;
    expect(tarea.id).toBe(archivo.tareas[0].nuevoId);
  });

  it("cada cosa nueva dice que la escribió Claude y de dónde salió", () => {
    const tarea = plan.ops.find((o) => o.tabla === "tasks_items" && o.accion === "crear" && o.fila.title === "Mandar el presupuesto") as Extract<Op, { accion: "crear" }>;
    expect(tarea.fila).toMatchObject({
      origin: "CLAUDE",
      source_kind: "LLAMADA",
      source_label: "llamada 2026-10-05",
      due_date: "2026-10-15",
    });
    expect(tarea.fila.field_src).toMatchObject({ title: "claude", due_date: "claude", assignee_id: "claude" });
  });

  it("«@yo» es tu fila «Yo», que se crea una sola vez", () => {
    const yos = plan.ops.filter((o) => o.tabla === "core_people" && o.accion === "crear" && o.fila.is_owner === true);
    expect(yos).toHaveLength(1);
    const abogada = plan.ops.find((o) => o.accion === "crear" && o.fila.title === "Llamar a la abogada") as Extract<Op, { accion: "crear" }>;
    expect(abogada.fila.assignee_id).toBe(yos[0].id);
  });

  it("alguien que sólo sale como «@Inés» entra igual al proyecto, y se avisa", () => {
    const ines = plan.ops.find((o) => o.tabla === "core_people" && o.accion === "crear" && o.fila.name === "Inés")!;
    const miembro = plan.ops.find((o) => o.tabla === "tasks_project_members" && o.accion === "crear" && o.fila.person_id === ines.id);
    expect(miembro).toBeTruthy();
    expect(plan.avisos.join("\n")).toContain("«Inés» no estaba en Personas");
  });

  it("los recordatorios no se cargan todavía", () => {
    expect(plan.ops.some((o) => (o.tabla as string).includes("reminder"))).toBe(false);
  });
});

describe("volver a importar el mismo archivo", () => {
  const archivo = leer(ARCHIVO);
  const primero = planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY });
  const despues = aplicar(VACIO, primero);

  it("no hace nada: ni duplica ni cambia", () => {
    const otra = leer(ARCHIVO, "9");
    const id = encontrarProyecto(otra, despues.proyectos);
    expect(id).toBe(archivo.nuevoId);
    const segundo = planearImportacion(otra, despues, { ahora: "2026-10-07T09:00:00Z", hoy: "2026-10-07" });
    expect(segundo.nuevo).toBe(false);
    expect(segundo.ops).toEqual([]);
    expect(segundo.lineas).toContain("Cambia: nada · Se borra: nada");
  });

  it("el mismo plan aplicado dos veces no duplica (los ids nacieron en el navegador)", () => {
    // `aplicar` falla si una fila se crea dos veces; la base hace lo mismo con
    // `on conflict (id) do nothing`.
    expect(() => aplicar(despues, { ...primero, ops: primero.ops.filter((o) => o.accion === "cambiar") })).not.toThrow();
  });
});

describe("nunca pisa lo tuyo", () => {
  const archivo = leer(ARCHIVO);
  const base = aplicar(VACIO, planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY }));

  it("una fecha que cambiaste en la app se queda, y se dice", () => {
    const estado = structuredClone(base);
    const tarea = estado.tareas.find((t) => t.title === "Llamar a la abogada")!;
    tarea.due_date = "2026-10-10";
    tarea.field_src = { ...tarea.field_src, due_date: "owner" };

    const nuevo = leer(ARCHIVO.replace("Llamar a la abogada — @yo — 2026-10-09", "Llamar a la abogada — @yo — 2026-10-12"), "9");
    const plan = planearImportacion(nuevo, estado, { ahora: AHORA, hoy: HOY });
    expect(plan.ops).toEqual([]);
    expect(plan.seQueda.join("\n")).toContain("«Llamar a la abogada»: la fecha (10 oct) lo pusiste tú.");
  });

  it("pero lo que escribió Claude sí se pone al día", () => {
    const nuevo = leer(ARCHIVO.replace("Llamar a la abogada — @yo — 2026-10-09", "Llamar a la abogada — @yo — 2026-10-12"), "9");
    const plan = planearImportacion(nuevo, base, { ahora: AHORA, hoy: HOY });
    expect(plan.ops).toHaveLength(1);
    expect(plan.ops[0]).toMatchObject({ tabla: "tasks_items", accion: "cambiar", cambios: { due_date: "2026-10-12" } });
    expect(plan.cambios).toContain("«Llamar a la abogada»: fecha 9 oct → 12 oct.");
  });

  it("un campo sin marca que ya tiene valor cuenta como tuyo (lo de antes de la marca)", () => {
    const estado = structuredClone(base);
    estado.proyecto!.objective = "Lo escribí yo hace tiempo";
    estado.proyecto!.field_src = {};
    const plan = planearImportacion(leer(ARCHIVO, "9"), estado, { ahora: AHORA, hoy: HOY });
    expect(plan.ops.filter((o) => o.tabla === "tasks_projects")).toEqual([]);
    expect(plan.seQueda.join("\n")).toContain("objetivo lo pusiste tú");
  });

  it("«Cómo va» y la ficha que escribiste tú no se pisan", () => {
    const estado = structuredClone(base);
    estado.proyecto!.how_md = "Mi versión";
    estado.proyecto!.how_by = "OWNER";
    estado.ficha!.body_md = "Mi ficha";
    estado.ficha!.made_by = "OWNER";
    const plan = planearImportacion(leer(ARCHIVO, "9"), estado, { ahora: AHORA, hoy: HOY });
    expect(plan.ops).toEqual([]);
    expect(plan.seQueda).toContain("«Cómo va» lo escribiste tú: no lo piso.");
    expect(plan.seQueda).toContain("La ficha técnica la editaste tú: no la piso.");
  });

  it("lo vacío se rellena aunque no tenga marca", () => {
    const estado = structuredClone(base);
    const tarea = estado.tareas.find((t) => t.title === "Pedir tres precios")!;
    expect(tarea.due_date).toBeNull();
    const plan = planearImportacion(
      leer(ARCHIVO.replace("Pedir tres precios — @Tomás", "Pedir tres precios — @Tomás — 2026-10-20"), "9"),
      estado,
      { ahora: AHORA, hoy: HOY },
    );
    expect(plan.ops).toEqual([
      expect.objectContaining({ tabla: "tasks_items", id: tarea.id, cambios: expect.objectContaining({ due_date: "2026-10-20" }) }),
    ]);
  });
});

describe("nunca borra", () => {
  const archivo = leer(ARCHIVO);
  const base = aplicar(VACIO, planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY }));

  it("lo que está en la app y no en el archivo se queda", () => {
    const corto = leer(ARCHIVO.replace(/## Tareas[\s\S]*?## Recordatorios/, "## Tareas\n- [ ] Llamar a la abogada — @yo — 2026-10-09\n\n## Recordatorios"), "9");
    const plan = planearImportacion(corto, base, { ahora: AHORA, hoy: HOY });
    expect(plan.ops).toEqual([]);
    expect(plan.noSeBorra.join("\n")).toContain("3 tareas abiertas de la app no están en el archivo");
  });

  it("[-] no borra: se dice que se quita en la app", () => {
    const plan = planearImportacion(leer(ARCHIVO.replace("- [ ] Llamar a la abogada", "- [-] Llamar a la abogada"), "9"), base, {
      ahora: AHORA,
      hoy: HOY,
    });
    expect(plan.ops).toEqual([]);
    expect(plan.noSeBorra.join("\n")).toContain("«Llamar a la abogada» lleva [-]");
  });

  it("ningún plan lleva nunca una operación de borrar", () => {
    for (const p of [planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY }), planearImportacion(leer(ARCHIVO, "9"), base, { ahora: AHORA, hoy: HOY })]) {
      expect(p.ops.every((o) => o.accion === "crear" || o.accion === "cambiar")).toBe(true);
    }
  });
});

describe("terminar es definitivo", () => {
  const base = aplicar(VACIO, planearImportacion(leer(ARCHIVO), VACIO, { ahora: AHORA, hoy: HOY }));

  it("una tarea hecha no se reabre desde el archivo", () => {
    const plan = planearImportacion(leer(ARCHIVO.replace("- [x] Presentarme con Tomás", "- [ ] Presentarme con Tomás"), "9"), base, {
      ahora: AHORA,
      hoy: HOY,
    });
    expect(plan.ops).toEqual([]);
    expect(plan.noSeBorra).toContain("«Presentarme con Tomás» está hecha: sólo tú la reabres.");
  });

  it("pero el archivo sí puede cerrar una tarea abierta", () => {
    const plan = planearImportacion(leer(ARCHIVO.replace("- [ ] Llamar a la abogada", "- [x] Llamar a la abogada"), "9"), base, {
      ahora: AHORA,
      hoy: HOY,
    });
    expect(plan.ops).toEqual([expect.objectContaining({ tabla: "tasks_items", cambios: expect.objectContaining({ status: "HECHA" }) })]);
  });

  it("salvo que el estado lo pusieras tú", () => {
    const estado = structuredClone(base);
    const t = estado.tareas.find((x) => x.title === "Llamar a la abogada")!;
    t.status = "EN_CURSO";
    t.field_src = { ...t.field_src, status: "owner" };
    const plan = planearImportacion(leer(ARCHIVO.replace("- [ ] Llamar a la abogada", "- [x] Llamar a la abogada"), "9"), estado, {
      ahora: AHORA,
      hoy: HOY,
    });
    expect(plan.ops).toEqual([]);
  });
});

describe("lo que no se sube", () => {
  it("un proyecto «solo títulos» o «reservado» se para entero", () => {
    for (const nube of ["solo titulos", "reservado"]) {
      const plan = planearImportacion(leer(ARCHIVO.replace("estado: en marcha", `estado: en marcha\nnube: ${nube}`)), VACIO, {
        ahora: AHORA,
        hoy: HOY,
      });
      expect(plan.bloqueo).toContain("no subo nada");
      expect(plan.ops).toEqual([]);
    }
  });

  it("otro proyecto con el mismo nombre no se duplica: se pone al día", () => {
    const estado = { ...VACIO, proyectos: [{ id: "abababab-0000-7000-8000-000000000001", name: "finca el roble", slug: null }] };
    expect(encontrarProyecto(leer(ARCHIVO), estado.proyectos)).toBe("abababab-0000-7000-8000-000000000001");
  });
});

describe("personas que ya existen", () => {
  it("se casan por nombre o alias, sin tildes ni mayúsculas", () => {
    const estado: EstadoParaImportar = {
      ...VACIO,
      personas: [
        { id: "cdcdcdcd-0000-7000-8000-000000000001", name: "lucia", aliases: [], is_owner: false, archived_at: null, relation: null, note: null, whatsapp_hint: null, field_src: {} },
        { id: "cdcdcdcd-0000-7000-8000-000000000002", name: "Tomás García", aliases: ["Tomás"], is_owner: false, archived_at: null, relation: null, note: null, whatsapp_hint: null, field_src: {} },
      ],
    };
    const plan = planearImportacion(leer(ARCHIVO), estado, { ahora: AHORA, hoy: HOY });
    const creadas = plan.ops.filter((o) => o.tabla === "core_people" && o.accion === "crear").map((o) => (o as Extract<Op, { accion: "crear" }>).fila.name);
    expect(creadas).toEqual(["Yo", "Inés"]);
    expect(plan.lineas).toContain("Personas: 4 (1 nueva: Inés)");
  });

  it("con dos homónimos fuera del proyecto, crea otra y avisa en vez de adivinar", () => {
    const una = { aliases: [], is_owner: false, archived_at: null, relation: null, note: null, whatsapp_hint: null, field_src: {} };
    const estado: EstadoParaImportar = {
      ...VACIO,
      personas: [
        { ...una, id: "efefefef-0000-7000-8000-000000000001", name: "Lucía" },
        { ...una, id: "efefefef-0000-7000-8000-000000000002", name: "Lucia" },
      ],
    };
    const plan = planearImportacion(leer(ARCHIVO), estado, { ahora: AHORA, hoy: HOY });
    expect(plan.avisos.join("\n")).toContain("Hay 2 personas que se llaman «Lucía»");
    expect(plan.ops.some((o) => o.tabla === "core_people" && o.accion === "crear" && o.fila.name === "Lucía")).toBe(true);
  });
});

describe("la huella", () => {
  it("es la misma para el mismo plan, aunque cambie la hora", () => {
    const archivo = leer(ARCHIVO);
    const a = planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY });
    const b = planearImportacion(archivo, VACIO, { ahora: "2026-10-06T15:05:00Z", hoy: HOY });
    expect(a.huella).toBe(b.huella);
  });

  it("cambia si cambia lo que se va a hacer", () => {
    const archivo = leer(ARCHIVO);
    const a = planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY });
    const conProyecto = { ...VACIO, proyectos: [{ id: "x", name: "Otra cosa", slug: "finca-el-roble" }] };
    const b = planearImportacion(archivo, conProyecto, { ahora: AHORA, hoy: HOY });
    expect(a.huella).not.toBe(b.huella);
    expect(huellaDe([])).toHaveLength(16);
  });
});

describe("renombrar en la app y volver a importar el archivo de antes", () => {
  const archivo = leer(ARCHIVO);
  const base = aplicar(VACIO, planearImportacion(archivo, VACIO, { ahora: AHORA, hoy: HOY }));

  /** Lo que hace la app al renombrar (domain/renames.ts). */
  function renombrado(): EstadoParaImportar {
    const e = structuredClone(base);
    const lucia = e.personas.find((p) => p.name === "Lucía")!;
    lucia.name = "Lucía Prado";
    lucia.aliases = ["Lucía"];
    lucia.field_src = { ...lucia.field_src, name: "owner", aliases: "owner" };
    const tarea = e.tareas.find((t) => t.title === "Llamar a la abogada")!;
    tarea.title = "Llamar a la abogada Marín";
    tarea.former_titles = ["Llamar a la abogada"];
    tarea.field_src = { ...tarea.field_src, title: "owner" };
    const hito = e.hitos.find((h) => h.title === "Tejado nuevo")!;
    hito.title = "Tejado nuevo y canalones";
    hito.former_titles = ["Tejado nuevo"];
    return e;
  }

  it("no crea otra persona, ni otra tarea, ni otro hito", () => {
    const plan = planearImportacion(leer(ARCHIVO, "9"), renombrado(), { ahora: AHORA, hoy: HOY });
    expect(plan.ops.filter((o) => o.accion === "crear")).toEqual([]);
    expect(plan.lineas).toContain("Nuevo: nada");
    expect(plan.revisar).toEqual([]);
  });

  it("y la tarea de Lucía sigue siendo de la Lucía de siempre", () => {
    const e = renombrado();
    const plan = planearImportacion(leer(ARCHIVO, "9"), e, { ahora: AHORA, hoy: HOY });
    const lucia = e.personas.find((p) => p.name === "Lucía Prado")!;
    const otraLucia = plan.ops.find((o) => o.tabla === "core_people" && o.accion === "crear");
    expect(otraLucia).toBeUndefined();
    expect(plan.ops.some((o) => o.accion === "cambiar" && o.cambios.assignee_id !== undefined && o.cambios.assignee_id !== lucia.id)).toBe(false);
  });

  it("sin el nombre de antes guardado, avisa arriba de que se parece en vez de callarse", () => {
    const e = structuredClone(base);
    e.personas.find((p) => p.name === "Lucía")!.name = "Lucía Prado";
    const t = e.tareas.find((x) => x.title === "Llamar a la abogada")!;
    t.title = "Llamar a la abogada Marín";
    const plan = planearImportacion(leer(ARCHIVO, "9"), e, { ahora: AHORA, hoy: HOY });
    expect(plan.revisar.join("\n")).toContain("«Lucía» se parece a «Lucía Prado»");
    expect(plan.revisar.join("\n")).toContain("La tarea nueva «Llamar a la abogada» se parece a «Llamar a la abogada Marín»");
    expect(plan.lineas.join("\n")).toContain("Tareas nuevas: «Llamar a la abogada»");
    expect(plan.lineas.join("\n")).toContain("Nuevo: 1 persona (Lucía) · 1 tarea");
  });
});

describe("el plan dice de quién a quién y de qué fecha a cuál", () => {
  const base = aplicar(VACIO, planearImportacion(leer(ARCHIVO), VACIO, { ahora: AHORA, hoy: HOY }));

  it("el responsable de una tarea, con los dos nombres", () => {
    const plan = planearImportacion(
      leer(ARCHIVO.replace("Mandar el presupuesto — @Tomás", "Mandar el presupuesto — @Lucía"), "9"),
      base,
      { ahora: AHORA, hoy: HOY },
    );
    expect(plan.cambios).toContain("«Mandar el presupuesto»: responsable de Tomás a Lucía.");
  });

  it("la fecha de un hito, con las dos fechas", () => {
    const plan = planearImportacion(leer(ARCHIVO.replace("@Tomás — 2026-11-30", "@Tomás — 2026-12-10"), "9"), base, {
      ahora: AHORA,
      hoy: HOY,
    });
    expect(plan.cambios).toContain("Hito «Tejado nuevo»: fecha 30 nov → 10 dic.");
  });

  it("el responsable de un frente que cambia no se llama «nuevo»", () => {
    const plan = planearImportacion(leer(ARCHIVO.replace("Obra (Tomás)", "Obra (Lucía)"), "9"), base, { ahora: AHORA, hoy: HOY });
    expect(plan.cambios).toContain("Frente Obra: responsable de Tomás a Lucía.");
  });

  it("en un proyecto que ya existe sólo se cuentan las cosas nuevas", () => {
    const plan = planearImportacion(
      leer(ARCHIVO.replace("## Recordatorios", "- [ ] Comprar teja — @Tomás\n\n## Recordatorios"), "9"),
      base,
      { ahora: AHORA, hoy: HOY },
    );
    expect(plan.lineas).toContain("Nuevo: 1 tarea");
    expect(plan.lineas).toContain("Tareas nuevas: «Comprar teja»");
    expect(plan.lineas.join("\n")).not.toMatch(/Hitos: \d/);
  });
});

describe("una tarea que cuelga de un hito", () => {
  it("se engancha al hito del archivo por su título", () => {
    const texto = ARCHIVO.replace("- [ ] Revisar el pozo — @Inés", "- [ ] Revisar el pozo — @Inés — hito: Tejado nuevo");
    const plan = planearImportacion(leer(texto), VACIO, { ahora: AHORA, hoy: HOY });
    const hito = plan.ops.find((o) => o.tabla === "tasks_milestones" && o.accion === "crear" && o.fila.title === "Tejado nuevo")!;
    const tarea = plan.ops.find((o) => o.accion === "crear" && o.fila.title === "Revisar el pozo") as Extract<Op, { accion: "crear" }>;
    expect(tarea.fila.milestone_id).toBe(hito.id);
  });

  it("un hito que no existe se avisa y la tarea queda sin hito", () => {
    const texto = ARCHIVO.replace("- [ ] Revisar el pozo — @Inés", "- [ ] Revisar el pozo — @Inés — hito: No existe");
    const plan = planearImportacion(leer(texto), VACIO, { ahora: AHORA, hoy: HOY });
    const tarea = plan.ops.find((o) => o.accion === "crear" && o.fila.title === "Revisar el pozo") as Extract<Op, { accion: "crear" }>;
    expect(tarea.fila.milestone_id).toBeUndefined();
    expect(plan.avisos.join("\n")).toContain("no encuentro el hito «No existe»");
  });
});

describe("un borrador suelto escrito a mano", () => {
  const SUELTO = `# Huerto del patio
## Gente
- Marta: consigue las semillas
- Julián (vecino del 3º): habla con el ayuntamiento
- El que tiene la llave del cuarto de abajo y no contesta

## Qué falta
- pedir permiso a la comunidad
- comprar tierra

## Presupuesto
- 200 euros
`;

  it("parte «Nombre: qué hace» y «Nombre (nota)»", () => {
    const a = leer(SUELTO);
    expect(a.personas.slice(0, 2).map((p) => [p.nombre, p.hace, p.nota])).toEqual([
      ["Marta", "consigue las semillas", null],
      ["Julián", "habla con el ayuntamiento", "vecino del 3º"],
    ]);
  });

  it("«Qué falta» son las tareas", () => {
    expect(leer(SUELTO).tareas.map((t) => t.titulo)).toEqual(["pedir permiso a la comunidad", "comprar tierra"]);
  });

  it("lo que hay que mirar antes de crear sale aparte: la sección que salta y el nombre que parece una frase", () => {
    const plan = planearImportacion(leer(SUELTO), VACIO, { ahora: AHORA, hoy: HOY });
    expect(plan.revisar.join("\n")).toContain("«Presupuesto»");
    expect(plan.revisar.join("\n")).toContain("no parece un nombre");
    expect(plan.avisos.join("\n")).not.toContain("«Presupuesto»");
  });
});
