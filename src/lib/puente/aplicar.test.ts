import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { baseFalsa, type BaseFalsa } from "./__pruebas__/base-falsa";
import { aplicarLote, aplicarUna, PROPUESTAS_ABIERTAS_MAX, type Contexto } from "./aplicar";
import type { ClientePuente } from "./firma";

/**
 * Aplicar lo que manda el bot, sobre una base de mentira (nombres inventados).
 *
 * Lo que se fija: un `op_id` se aplica una vez; cada cliente pide sólo lo
 * suyo; lo deducido nunca pisa lo que escribió el dueño; lo que cambió en la
 * app después de lo que vio el bot vuelve como conflicto; terminar es
 * definitivo; lo privado no sube; y lo que aún no existe espera.
 */

const YO = "aaaaaaaa-0000-4000-8000-0000000000e4";
const PROYECTO = "0192f000-0000-7000-8000-0000000000a1";
const MARTA = "0192f000-0000-7000-8000-0000000000b1";
const TAREA = "0192f000-0000-7000-8000-0000000000f1";

let base: BaseFalsa;
let n = 0;
const opId = () => `0192f000-0000-7000-8000-${String((n += 1)).padStart(12, "0")}`;

function ctx(cliente: ClientePuente = "mac-1", ahora = new Date("2026-10-06T12:00:00Z")): Contexto {
  return { admin: base as never, userId: YO, cliente, ahora, zona: "America/New_York" };
}

function op(kind: string, data: unknown, extra: Record<string, unknown> = {}) {
  return { v: 1, op_id: opId(), kind, at: "2026-10-06T12:00:00Z", origin: "owner", data, ...extra };
}

beforeEach(() => {
  base = baseFalsa({
    tasks_projects: [{ id: PROYECTO, user_id: YO, name: "Casa de la sierra", slug: "casa-de-la-sierra", status: "EN_MARCHA", version: 1, field_src: {}, aliases: [] }],
    core_people: [{ id: MARTA, user_id: YO, name: "Marta", aliases: [], version: 1, field_src: { name: "owner" } }],
  });
});

describe("idempotencia", () => {
  it("el mismo op_id dos veces: se aplica una y la segunda dice lo mismo", async () => {
    const tarea = op("tarea_crear", { id: TAREA, titulo: "Mandar los planos", proyecto_id: PROYECTO });
    const [a] = await aplicarLote(ctx(), [tarea]);
    const [b] = await aplicarLote(ctx(), [tarea]);
    expect(a).toMatchObject({ estado: "applied", id: TAREA });
    expect(b).toMatchObject({ estado: "duplicate", id: TAREA, op_id: tarea.op_id });
    expect(base.tablas.tasks_items).toHaveLength(1);
    expect(base.tablas.puente_ops).toHaveLength(1);
  });

  it("otra operación con la misma clave externa no duplica: devuelve la fila de siempre", async () => {
    const datos = { titulo: "Mandar los planos", proyecto_id: PROYECTO, ext_source: "reunion", ext_id: "mt:0123456789abcdef:3" };
    await aplicarUna(ctx(), op("tarea_crear", { id: TAREA, ...datos }, { origin: "bot" }));
    const r = await aplicarUna(ctx(), op("tarea_crear", { id: "0192f000-0000-7000-8000-0000000000f2", ...datos }, { origin: "bot" }));
    expect(r).toMatchObject({ estado: "applied", id: TAREA });
    expect(base.tablas.tasks_items).toHaveLength(1);
  });

  it("crear algo que ya existe con el mismo id no duplica (reintento tras un corte)", async () => {
    const datos = { id: "0192f000-0000-7000-8000-0000000000b9", nombre: "Rafael" };
    await aplicarUna(ctx(), op("persona_crear", datos));
    const r = await aplicarUna(ctx(), op("persona_crear", datos));
    expect(r.estado).toBe("applied");
    expect(base.tablas.core_people).toHaveLength(2);
  });

  it("las cifras y el latido no se apuntan en el registro (se repiten cada pocos minutos)", async () => {
    await aplicarUna(ctx(), op("metricas_del_dia", { fecha: "2026-10-06", cifras: { tomados: 1 } }, { origin: "bot" }));
    expect(base.tablas.puente_ops ?? []).toHaveLength(0);
  });
});

describe("quién puede pedir qué", () => {
  it("Claude sólo con origin claude, y el bot nunca como Claude", async () => {
    const r1 = await aplicarUna(ctx("claude-1"), op("tarea_crear", { id: TAREA, titulo: "x" }));
    const r2 = await aplicarUna(ctx("mac-1"), op("tarea_crear", { id: TAREA, titulo: "x" }, { origin: "claude" }));
    expect(r1).toMatchObject({ estado: "rejected", motivo: "origen" });
    expect(r2).toMatchObject({ estado: "rejected", motivo: "origen" });
    expect(base.tablas.tasks_items ?? []).toHaveLength(0);
  });

  it("Claude no manda el latido ni las cifras de WhatsApp", async () => {
    const r = await aplicarUna(
      ctx("claude-1"),
      op("metricas_del_dia", { fecha: "2026-10-06", cifras: { tomados: 1 } }, { origin: "claude" }),
    );
    expect(r).toMatchObject({ estado: "rejected", motivo: "cliente" });
  });

  it("lo deducido no crea proyectos, no enlaza WhatsApp, no escribe la ficha ni reabre", async () => {
    for (const [kind, data] of [
      ["proyecto_crear", { id: "0192f000-0000-7000-8000-0000000000a9", nombre: "Inventado" }],
      ["persona_enlazar_wa", { id: MARTA, enlazada: true }],
      ["doc_guardar", { proyecto_id: PROYECTO, tipo: "FICHA", cuerpo: "x" }],
      ["tarea_reabrir", { id: TAREA }],
    ] as const) {
      expect(await aplicarUna(ctx(), op(kind, data, { origin: "bot" })), kind).toMatchObject({ estado: "rejected", motivo: "origen" });
    }
  });

  it("un sobre roto se rechaza con su op_id si lo trae", async () => {
    const malo = { ...op("tarea_crear", { id: TAREA, titulo: "x" }), intruso: true };
    expect(await aplicarUna(ctx(), malo)).toMatchObject({ estado: "rejected", motivo: "forma", op_id: malo.op_id });
  });
});

describe("lo privado no sube", () => {
  it("un teléfono en un título del bot se rechaza y no se escribe nada", async () => {
    const r = await aplicarUna(ctx(), op("tarea_crear", { id: TAREA, titulo: "Llamar al 412 555 1234" }, { origin: "bot" }));
    expect(r).toMatchObject({ estado: "rejected", motivo: "dato_privado" });
    expect(base.tablas.tasks_items ?? []).toHaveLength(0);
  });

  it("un jid, venga de quien venga", async () => {
    const r = await aplicarUna(ctx(), op("bitacora_nota", { id: "0192f000-0000-7000-8000-000000000101", proyecto_id: PROYECTO, tipo: "NOTA", titulo: "ver 58412@s.whatsapp.net" }));
    expect(r).toMatchObject({ estado: "rejected", motivo: "dato_privado" });
  });
});

describe("lo que escribió el dueño manda", () => {
  beforeEach(async () => {
    await aplicarUna(ctx(), op("tarea_crear", { id: TAREA, titulo: "Mandar los planos", proyecto_id: PROYECTO, fecha: "2026-10-15" }));
  });

  it("el bot no cambia el título ni la fecha del dueño; sí rellena el responsable", async () => {
    const r = await aplicarUna(
      ctx(),
      op("tarea_cambiar", { id: TAREA, campos: { titulo: "Otro", fecha: "2026-10-20", responsable_id: MARTA } }, { origin: "bot" }),
    );
    expect(r.estado).toBe("applied");
    expect(r.omitidos?.sort()).toEqual(["due_date", "title"]);
    const t = base.tablas.tasks_items[0];
    expect(t).toMatchObject({ title: "Mandar los planos", due_date: "2026-10-15", assignee_id: MARTA });
    expect(t.field_src).toMatchObject({ title: "owner", due_date: "owner", assignee_id: "bot" });
  });

  it("si cambió en la app después de lo que vio el bot, conflicto y no se pisa nada", async () => {
    base.tablas.tasks_items[0].version = 5;
    const r = await aplicarUna(ctx(), op("tarea_cambiar", { id: TAREA, campos: { fecha: "2026-10-20" } }, { base_version: 4 }));
    expect(r.estado).toBe("conflict");
    expect(r.actual).toMatchObject({ id: TAREA, due_date: "2026-10-15", version: 5 });
    expect(r.actual).not.toHaveProperty("field_src");
    expect(base.tablas.tasks_items[0].due_date).toBe("2026-10-15");
  });

  it("renombrar guarda el título de antes", async () => {
    await aplicarUna(ctx(), op("tarea_cambiar", { id: TAREA, campos: { titulo: "Mandar los planos firmados" } }));
    expect(base.tablas.tasks_items[0].former_titles).toEqual(["Mandar los planos"]);
  });
});

describe("terminar es definitivo", () => {
  beforeEach(async () => {
    await aplicarUna(ctx(), op("tarea_crear", { id: TAREA, titulo: "Mandar los planos" }));
  });

  it("hecha dos veces es hecha una vez", async () => {
    await aplicarUna(ctx(), op("tarea_hecha", { id: TAREA }));
    const cuando = base.tablas.tasks_items[0].completed_at;
    const r = await aplicarUna(ctx("mac-1", new Date("2026-10-07T12:00:00Z")), op("tarea_hecha", { id: TAREA }));
    expect(r.estado).toBe("applied");
    expect(base.tablas.tasks_items[0]).toMatchObject({ status: "HECHA", completed_at: cuando });
  });

  it("cambiar no reabre; reabrir sólo el dueño", async () => {
    await aplicarUna(ctx(), op("tarea_hecha", { id: TAREA }));
    const cambio = await aplicarUna(ctx(), op("tarea_cambiar", { id: TAREA, campos: { estado: "EN_CURSO" } }));
    expect(cambio.estado).toBe("conflict");
    const r = await aplicarUna(ctx(), op("tarea_reabrir", { id: TAREA }));
    expect(r.estado).toBe("applied");
    expect(base.tablas.tasks_items[0]).toMatchObject({ status: "NO_INICIADA", completed_at: null });
  });
});

describe("propuestas", () => {
  const propuesta = (id: string, extra: Record<string, unknown> = {}) =>
    op(
      "propuesta_crear",
      { id, tipo: "TAREA", proyecto_id: PROYECTO, titulo: "Tarea de Marta: mandar los planos", confianza: "FIRME", ...extra },
      { origin: "bot" },
    );

  it("lo que ya se propuso (y se descartó) no vuelve", async () => {
    const ext = { ext_source: "analisis", ext_id: "bp:42" };
    await aplicarUna(ctx(), propuesta("0192f000-0000-7000-8000-000000000104", ext));
    base.tablas.core_inbox[0].status = "DESCARTADA";
    const r = await aplicarUna(ctx(), propuesta("0192f000-0000-7000-8000-000000000105", ext));
    expect(r).toMatchObject({ estado: "applied", id: "0192f000-0000-7000-8000-000000000104" });
    expect(base.tablas.core_inbox).toHaveLength(1);
  });

  it(`como mucho ${PROPUESTAS_ABIERTAS_MAX} abiertas por proyecto`, async () => {
    for (let i = 0; i < PROPUESTAS_ABIERTAS_MAX; i += 1) {
      expect((await aplicarUna(ctx(), propuesta(`0192f000-0000-7000-8000-0000000002${String(i).padStart(2, "0")}`))).estado).toBe("applied");
    }
    expect(await aplicarUna(ctx(), propuesta("0192f000-0000-7000-8000-000000000299"))).toMatchObject({ estado: "rejected", motivo: "tope" });
  });

  it("contestar en un sitio la cierra en el otro: si ya se decidió distinto, conflicto", async () => {
    await aplicarUna(ctx(), propuesta("0192f000-0000-7000-8000-000000000104"));
    Object.assign(base.tablas.core_inbox[0], { status: "ACEPTADA", decided_at: "2026-10-06T11:00:00Z", decided_via: "WEB" });
    const otra = await aplicarUna(ctx(), op("propuesta_decidir", { id: "0192f000-0000-7000-8000-000000000104", decision: "DESCARTADA", via: "WHATSAPP" }));
    expect(otra.estado).toBe("conflict");
    expect(otra.actual).toMatchObject({ status: "ACEPTADA", decided_via: "WEB" });
    const igual = await aplicarUna(ctx(), op("propuesta_decidir", { id: "0192f000-0000-7000-8000-000000000104", decision: "ACEPTADA", via: "WHATSAPP" }));
    expect(igual.estado).toBe("applied");
  });
});

describe("lo que aún no existe espera", () => {
  it("un recordatorio sin su tabla vuelve no_disponible y no se apunta: el reintento lo vuelve a probar", async () => {
    base.ausentes.add("core_reminders");
    const recordatorio = op("recordatorio_crear", { id: "0192f000-0000-7000-8000-000000000103", texto: "Revisar el presupuesto", frecuencia: "DIARIO", hora: "08:00" });
    expect(await aplicarUna(ctx(), recordatorio)).toMatchObject({ estado: "rejected", motivo: "no_disponible" });
    expect(base.tablas.puente_ops ?? []).toHaveLength(0);
    base.ausentes.delete("core_reminders");
    expect((await aplicarUna(ctx(), recordatorio)).estado).toBe("applied");
    expect(base.tablas.core_reminders[0]).toMatchObject({ text: "Revisar el presupuesto", freq: "DIARIO", tz: "America/New_York" });
  });

  it("unir personas espera a las órdenes", async () => {
    const r = await aplicarUna(ctx(), op("personas_unir", { queda: MARTA, se_va: "0192f000-0000-7000-8000-0000000000b2" }));
    expect(r).toMatchObject({ estado: "rejected", motivo: "no_disponible" });
  });

  it("una referencia a algo que no existe se rechaza (no se inventa)", async () => {
    const r = await aplicarUna(ctx(), op("tarea_crear", { id: TAREA, titulo: "x", responsable_id: "0192f000-0000-7000-8000-0000000000b7" }));
    expect(r).toMatchObject({ estado: "rejected", motivo: "referencia" });
  });
});

describe("borrar en la Mac borra aquí", () => {
  it("fuente_borrada se lleva la fuente, las propuestas abiertas y la bitácora de esa referencia", async () => {
    const ref = "mt:0123456789abcdef:3";
    const fuente = { tipo: "REUNION", ref, etiqueta: "Reunión del 5 oct" };
    await aplicarLote(ctx(), [
      op("fuente_poner", { id: "0192f000-0000-7000-8000-000000000102", proyecto_id: PROYECTO, tipo: "REUNION", etiqueta: "Reunión del 5 oct", ref }, { origin: "bot" }),
      op("propuesta_crear", { id: "0192f000-0000-7000-8000-000000000104", tipo: "TAREA", proyecto_id: PROYECTO, titulo: "Mandar los planos", confianza: "FIRME", fuente }, { origin: "bot" }),
      op("bitacora_nota", { id: "0192f000-0000-7000-8000-000000000101", proyecto_id: PROYECTO, tipo: "REUNION", titulo: "Reunión del 5 oct", fuente }, { origin: "bot" }),
      op("tarea_crear", { id: TAREA, titulo: "Mandar los planos", proyecto_id: PROYECTO, fuente }, { origin: "bot" }),
    ]);
    const r = await aplicarUna(ctx(), op("fuente_borrada", { ref }, { origin: "bot" }));
    expect(r.estado).toBe("applied");
    expect(base.tablas.tasks_project_sources).toHaveLength(0);
    expect(base.tablas.core_inbox).toHaveLength(0);
    expect(base.tablas.tasks_project_log).toHaveLength(0);
    expect(base.tablas.tasks_items[0]).toMatchObject({ source_ref: null, source_label: null, title: "Mandar los planos" });
  });
});

describe("el estado del motor", () => {
  const estado = (boot: string) =>
    op("agente_estado", { boot_id: boot, version: "wa-core-2", panel_url: "https://panel.ejemplo.test", wa_conectado: true, donde: "MAC" }, { origin: "bot" });

  it("apunta el latido, el panel y si WhatsApp está conectado", async () => {
    await aplicarUna(ctx(), estado("4b8f0c1e-2d3a-4f5b-8c6d-7e8f9a0b1c2d"));
    expect(base.tablas.puente_clientes[0]).toMatchObject({
      cliente: "mac-1",
      wa_conectado: true,
      panel_url: "https://panel.ejemplo.test",
      estado_en: "2026-10-06T12:00:00.000Z",
    });
  });

  it("dos procesos con la misma llave: el arranque va y vuelve y se nota", async () => {
    const a = "4b8f0c1e-2d3a-4f5b-8c6d-7e8f9a0b1c2d";
    const b = "5c9a1d2f-3e4b-4a6c-9d7e-8f9a0b1c2d3e";
    await aplicarUna(ctx("mac-1", new Date("2026-10-06T12:00:00Z")), estado(a));
    await aplicarUna(ctx("mac-1", new Date("2026-10-06T12:01:00Z")), estado(b));
    expect(base.tablas.puente_clientes[0].dos_motores_en ?? null).toBeNull();
    await aplicarUna(ctx("mac-1", new Date("2026-10-06T12:02:00Z")), estado(a));
    expect(base.tablas.puente_clientes[0].dos_motores_en).toBe("2026-10-06T12:02:00.000Z");
  });

  it("un reinicio normal (otro arranque que se queda) no es «dos motores»", async () => {
    await aplicarUna(ctx("mac-1", new Date("2026-10-06T12:00:00Z")), estado("4b8f0c1e-2d3a-4f5b-8c6d-7e8f9a0b1c2d"));
    await aplicarUna(ctx("mac-1", new Date("2026-10-06T12:05:00Z")), estado("5c9a1d2f-3e4b-4a6c-9d7e-8f9a0b1c2d3e"));
    await aplicarUna(ctx("mac-1", new Date("2026-10-06T12:06:00Z")), estado("5c9a1d2f-3e4b-4a6c-9d7e-8f9a0b1c2d3e"));
    expect(base.tablas.puente_clientes[0].dos_motores_en ?? null).toBeNull();
  });

  it("las cifras del día se reescriben, no se suman", async () => {
    await aplicarUna(ctx(), op("metricas_del_dia", { fecha: "2026-10-06", cifras: { chats_esperando: 3, tomados: 1 } }, { origin: "bot" }));
    await aplicarUna(ctx(), op("metricas_del_dia", { fecha: "2026-10-06", cifras: { chats_esperando: 2 } }, { origin: "bot" }));
    const filas = base.tablas.core_daily_metrics;
    expect(filas).toHaveLength(2);
    expect(filas.find((f) => f.metric_key === "chats_esperando")).toMatchObject({ value: 2, module: "whatsapp" });
  });
});

describe("proyectos", () => {
  it("cambiar el estado lo apunta en la bitácora y cierra la fecha", async () => {
    const r = await aplicarUna(ctx(), op("proyecto_cambiar", { id: PROYECTO, campos: { estado: "TERMINADO" } }));
    expect(r.estado).toBe("applied");
    expect(base.tablas.tasks_projects[0]).toMatchObject({ status: "TERMINADO", closed_on: "2026-10-06" });
    expect(base.tablas.tasks_project_log[0]).toMatchObject({ kind: "ESTADO", auto: true });
  });

  it("un proyecto con el nombre de otro es un conflicto, no un duplicado", async () => {
    const r = await aplicarUna(ctx(), op("proyecto_crear", { id: "0192f000-0000-7000-8000-0000000000a2", nombre: "casa de la sierra" }));
    expect(r.estado).toBe("conflict");
    expect(base.tablas.tasks_projects).toHaveLength(1);
  });

  it("el semáforo puesto vale catorce días", async () => {
    await aplicarUna(ctx(), op("proyecto_cambiar", { id: PROYECTO, campos: { salud: "ROJO" } }));
    expect(base.tablas.tasks_projects[0]).toMatchObject({ health: "ROJO", health_until: "2026-10-20T12:00:00.000Z" });
  });
});
