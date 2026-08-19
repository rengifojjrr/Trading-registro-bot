import { describe, expect, it } from "vitest";

import { STATUS_LABELS } from "./content";
import {
  byChannel,
  byPlatform,
  funnel,
  minutesByEditStyle,
  overdue,
  publishedByMonth,
  workTotals,
  type AnalysablePiece,
} from "./content-analysis";

const TZ = "America/Bogota";

function piece(over: Partial<AnalysablePiece> = {}): AnalysablePiece {
  return {
    status: "IDEA",
    plannedDate: null,
    publishedAt: null,
    channels: [],
    platforms: [],
    recordMinutes: null,
    editMinutes: null,
    editTimeUncapped: false,
    editStyles: [],
    contentType: "VIDEO",
    ...over,
  };
}

describe("funnel", () => {
  it("mantiene el orden del proceso y no el del recuento", () => {
    const points = funnel(
      [piece({ status: "FALTA_EDITAR" }), piece({ status: "FALTA_EDITAR" }), piece()],
      STATUS_LABELS,
    );

    expect(points).toHaveLength(10);
    expect(points[0].label).toBe("Idea");
    expect(points[0].value).toBe(1);
    expect(points.find((p) => p.label === "Falta editar")?.value).toBe(2);
  });
});

describe("byChannel y byPlatform", () => {
  it("cuentan una pieza en cada uno de sus canales", () => {
    const points = byChannel([piece({ channels: ["PEKAS TRADING", "PEKAS"] })]);

    expect(points).toEqual([
      { label: "PEKAS TRADING", value: 1 },
      { label: "PEKAS", value: 1 },
    ]);
  });

  it("respetan el orden de la lista de opciones, no el del recuento", () => {
    // PEKAS TRADING va antes que PEKAS en la lista, aunque tenga menos.
    const points = byChannel([
      piece({ channels: ["PEKAS"] }),
      piece({ channels: ["PEKAS"] }),
      piece({ channels: ["PEKAS TRADING"] }),
    ]);

    expect(points.map((p) => p.label)).toEqual(["PEKAS TRADING", "PEKAS"]);
  });

  it("dejan fuera lo que está a cero", () => {
    expect(byPlatform([piece({ platforms: ["TikTok"] })])).toEqual([{ label: "TikTok", value: 1 }]);
  });

  it("recogen un valor que ya no está en la lista en lugar de perderlo", () => {
    const points = byPlatform([piece({ platforms: ["Twitch"] })]);
    expect(points).toEqual([{ label: "Twitch", value: 1 }]);
  });
});

describe("minutesByEditStyle", () => {
  it("suma las horas de cada estilo, contando una pieza en los dos suyos", () => {
    const points = minutesByEditStyle([
      piece({ editMinutes: 120, editStyles: ["Sencilla", "Gameplay"] }),
      piece({ editMinutes: 240, editStyles: ["Gameplay"] }),
    ]);

    expect(points).toEqual([
      { label: "Gameplay", value: 6 },
      { label: "Sencilla", value: 2 },
    ]);
  });

  it("ignora las piezas sin tiempo apuntado", () => {
    expect(minutesByEditStyle([piece({ editStyles: ["Sencilla"] })])).toEqual([]);
  });
});

describe("workTotals", () => {
  it("suma grabación y edición por separado", () => {
    const totals = workTotals([
      piece({ recordMinutes: 60, editMinutes: 120 }),
      piece({ recordMinutes: 30, editMinutes: 60 }),
    ]);

    expect(totals.recordMinutes).toBe(90);
    expect(totals.editMinutes).toBe(180);
    expect(totals.measured).toBe(2);
  });

  it("avisa de que el total es un mínimo si alguna pieza dejó de contar", () => {
    const totals = workTotals([piece({ editMinutes: 600, editTimeUncapped: true })]);
    expect(totals.isFloor).toBe(true);
  });

  it("no cuenta las piezas sin ningún tiempo", () => {
    expect(workTotals([piece()]).measured).toBe(0);
  });
});

describe("publishedByMonth", () => {
  it("rellena los meses sin publicaciones para no falsear la tendencia", () => {
    const points = publishedByMonth(
      [
        piece({ status: "PUBLICADO", publishedAt: "2026-06-10T15:00:00Z" }),
        piece({ status: "PUBLICADO", publishedAt: "2026-08-02T15:00:00Z" }),
      ],
      TZ,
    );

    // Junio, julio (a cero) y agosto: julio no se salta.
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points[1].value).toBe(0);
  });

  it("no devuelve nada si no se ha publicado todavía", () => {
    expect(publishedByMonth([piece()], TZ)).toEqual([]);
  });
});

describe("overdue", () => {
  it("mide el retraso desde la fecha planificada", () => {
    const list = overdue(
      [{ ...piece({ status: "FALTA_EDITAR", plannedDate: "2026-08-01" }), title: "Vídeo viejo" }],
      "2026-08-19",
    );

    expect(list[0]).toEqual({ title: "Vídeo viejo", status: "FALTA_EDITAR", days: 18 });
  });

  it("no cuenta lo publicado ni lo que no tiene fecha", () => {
    const list = overdue(
      [
        { ...piece({ status: "PUBLICADO", plannedDate: "2026-01-01" }), title: "Publicado" },
        { ...piece({ status: "IDEA" }), title: "Sin fecha" },
      ],
      "2026-08-19",
    );

    expect(list).toEqual([]);
  });

  it("ordena del más atrasado al menos y respeta el límite", () => {
    const list = overdue(
      [
        { ...piece({ status: "IDEA", plannedDate: "2026-08-18" }), title: "Reciente" },
        { ...piece({ status: "IDEA", plannedDate: "2026-01-01" }), title: "Antiguo" },
      ],
      "2026-08-19",
      1,
    );

    expect(list.map((p) => p.title)).toEqual(["Antiguo"]);
  });
});
