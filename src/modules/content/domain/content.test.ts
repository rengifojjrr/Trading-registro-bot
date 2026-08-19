import { describe, expect, it } from "vitest";

import {
  EDIT_TIME_OPTIONS,
  RECORD_TIME_OPTIONS,
  STATUSES,
  countByStatus,
  countPieces,
  formatWorkTime,
  nextStatus,
  type PieceLike,
} from "./content";

const TODAY = "2026-08-19";

function piece(over: Partial<PieceLike> = {}): PieceLike {
  return { status: "IDEA", plannedDate: null, publishedAt: null, ...over };
}

describe("nextStatus", () => {
  it("avanza por el proceso en el orden real de Notion", () => {
    expect(nextStatus("IDEA")).toBe("FALTA_GUION");
    expect(nextStatus("FALTA_GUION")).toBe("FALTA_GRABAR");
    expect(nextStatus("EDITANDO")).toBe("EDITADO_FALTA_LINK");
    expect(nextStatus("FALTA_MINIATURA")).toBe("LISTO_PARA_PUBLICAR");
  });

  it("publicado es el final", () => {
    expect(nextStatus("PUBLICADO")).toBeNull();
  });
});

describe("countPieces", () => {
  it("separa la cola de trabajo de lo publicado", () => {
    const counts = countPieces(
      [piece(), piece({ status: "EDITANDO" }), piece({ status: "PUBLICADO" })],
      TODAY,
    );
    expect(counts.inProgress).toBe(2);
    expect(counts.published).toBe(1);
  });

  it("cuenta como atrasado lo planificado para antes de hoy y sin publicar", () => {
    const counts = countPieces(
      [piece({ status: "FALTA_EDITAR", plannedDate: "2026-08-10" })],
      TODAY,
    );
    expect(counts.late).toBe(1);
  });

  it("lo ya publicado nunca está atrasado, aunque saliera tarde", () => {
    const counts = countPieces(
      [piece({ status: "PUBLICADO", plannedDate: "2026-01-01", publishedAt: "2026-08-19T10:00:00Z" })],
      TODAY,
    );
    expect(counts.late).toBe(0);
  });

  it("una idea sin fecha no está atrasada", () => {
    expect(countPieces([piece()], TODAY).late).toBe(0);
  });

  it("cuenta lo que está en manos del editor", () => {
    const counts = countPieces(
      [
        piece({ status: "FALTA_EDITAR" }),
        piece({ status: "EDITANDO" }),
        piece({ status: "EDITADO_FALTA_LINK" }),
        piece({ status: "FALTA_GRABAR" }),
      ],
      TODAY,
    );

    expect(counts.withEditor).toBe(3);
  });
});

describe("countByStatus", () => {
  it("devuelve los diez estados aunque estén a cero", () => {
    // Una columna vacía es información: «no tengo nada grabado».
    const counts = countByStatus([piece({ status: "IDEA" })]);

    expect(Object.keys(counts)).toHaveLength(10);
    expect(counts.IDEA).toBe(1);
    expect(counts.FALTA_GRABAR).toBe(0);
  });
});

describe("las opciones de tiempo", () => {
  it("mantienen la opción real de «deje de contar» y la marcan como suelo", () => {
    const uncapped = EDIT_TIME_OPTIONS.find((o) => o.uncapped);

    expect(uncapped?.label).toBe("despues de las 10 deje de contar");
    expect(uncapped?.minutes).toBe(600);
  });

  it("no tienen ninguna opción sin minutos: una etiqueta sin número no se puede promediar", () => {
    for (const option of [...RECORD_TIME_OPTIONS, ...EDIT_TIME_OPTIONS]) {
      expect(option.minutes).toBeGreaterThan(0);
    }
  });
});

describe("formatWorkTime", () => {
  it("dice horas y minutos", () => {
    expect(formatWorkTime(150)).toBe("2h 30m");
    expect(formatWorkTime(120)).toBe("2h");
    expect(formatWorkTime(45)).toBe("45m");
  });

  it("marca como mínimo lo que se dejó de contar", () => {
    expect(formatWorkTime(600, true)).toBe("10h o más");
  });

  it("sin dato no inventa un cero", () => {
    expect(formatWorkTime(null)).toBe("--");
  });
});

describe("la lista de estados", () => {
  it("tiene los diez del calendario, sin repetidos", () => {
    expect(new Set(STATUSES).size).toBe(10);
  });
});
