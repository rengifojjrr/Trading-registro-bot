import { describe, expect, it } from "vitest";

import { comoVaAviso, queFaltaAviso, tuDiaAviso, type TareaParaAviso } from "./live-reminders";

/** Los recordatorios vivos, con nombres inventados. */

const YO = "yo";
const LUCIA = "lucia";

function t(title: string, extra: Partial<TareaParaAviso> = {}): TareaParaAviso {
  return { title, status: "NO_INICIADA", priority: "MEDIA", due_date: null, assignee_id: null, parent_id: null, ...extra };
}

describe("«Qué falta en…»", () => {
  it("lo atrasado primero, con quién lo hace, y «y N más»", () => {
    const aviso = queFaltaAviso(
      "Finca",
      [
        t("Sin fecha"),
        t("Planos", { assignee_id: LUCIA, due_date: "2026-10-15" }),
        t("Llamar a la notaria", { assignee_id: YO, due_date: "2026-10-01" }),
        t("Ya hecha", { status: "HECHA", due_date: "2026-09-01" }),
        t("Subtarea", { parent_id: "x", due_date: "2026-09-01" }),
        t("Otra", { due_date: "2026-10-20" }),
      ],
      YO,
      { [LUCIA]: "Lucía" },
      "2026-10-07",
    );
    expect(aviso.title).toBe("Qué falta en Finca");
    expect(aviso.body).toBe("Tú: Llamar a la notaria (1 oct) · Lucía: Planos (15 oct) · Tú: Otra (20 oct) · y 1 más");
  });

  it("sin nada abierto lo dice", () => {
    expect(queFaltaAviso("Finca", [t("x", { status: "HECHA" })], YO, {}, "2026-10-07").body).toBe(
      "Nada pendiente. Todo al día.",
    );
  });
});

describe("«Cómo va…»", () => {
  it("el semáforo con palabras, lo próximo y lo atrasado", () => {
    const aviso = comoVaAviso(
      "Finca",
      {
        health: { level: "AMARILLO", why: "2 tareas atrasadas" },
        next: { title: "Visita", date: "2026-10-08" },
        overdue: 2,
        open: 5,
        progressLabel: "3 de 7 hitos",
      },
      "2026-10-07",
    );
    expect(aviso).toEqual({
      title: "Cómo va Finca",
      body: "Atención: 2 tareas atrasadas · Lo próximo: Visita (mañana) · 2 atrasadas · 3 de 7 hitos",
    });
  });

  it("en pausa, sin semáforo, dice el estado", () => {
    const aviso = comoVaAviso("Finca", { health: { level: null, why: "En pausa" }, next: null, overdue: 0, open: 0, progressLabel: null }, "2026-10-07");
    expect(aviso.body).toBe("En pausa");
  });
});

describe("«Tu día»", () => {
  it("lo de hoy, lo atrasado, lo que va a sonar y lo que pide atención", () => {
    const aviso = tuDiaAviso({
      paraHoy: 3,
      atrasadas: 1,
      recordatorios: 2,
      proyectos: [
        { name: "Finca", level: "AMARILLO" },
        { name: "Casa", level: "VERDE" },
        { name: "Canal", level: "ROJO" },
      ],
      primera: "Llamar a la notaria",
    });
    expect(aviso.body).toBe(
      "3 tareas para hoy · 1 atrasada · 2 recordatorios más · Canal: riesgo · Finca: atención. Empieza por: Llamar a la notaria.",
    );
  });

  it("un día sin nada lo dice en una línea", () => {
    expect(tuDiaAviso({ paraHoy: 0, atrasadas: 0, recordatorios: 0, proyectos: [], primera: null }).body).toBe(
      "Nada para hoy. Día libre de pendientes.",
    );
  });

  it("nunca pasa de 240 caracteres", () => {
    const largo = "x".repeat(400);
    expect(tuDiaAviso({ paraHoy: 1, atrasadas: 0, recordatorios: 0, proyectos: [], primera: largo }).body.length).toBeLessThanOrEqual(240);
  });
});
