import { describe, expect, it } from "vitest";

import { countByStatus, countPieces, nextStatus, type PieceLike } from "./content";

const TODAY = "2026-08-19";

function piece(over: Partial<PieceLike> = {}): PieceLike {
  return { status: "IDEA", plannedDate: null, publishedAt: null, ...over };
}

describe("nextStatus", () => {
  it("avanza por el proceso en orden", () => {
    expect(nextStatus("IDEA")).toBe("GRABADO");
    expect(nextStatus("GRABADO")).toBe("EDITADO");
    expect(nextStatus("EDITADO")).toBe("PROGRAMADO");
    expect(nextStatus("PROGRAMADO")).toBe("PUBLICADO");
  });

  it("publicado es el final", () => {
    expect(nextStatus("PUBLICADO")).toBeNull();
  });
});

describe("countPieces", () => {
  it("separa la cola de trabajo de lo publicado", () => {
    const counts = countPieces(
      [piece(), piece({ status: "EDITADO" }), piece({ status: "PUBLICADO" })],
      TODAY,
    );
    expect(counts.inProgress).toBe(2);
    expect(counts.published).toBe(1);
  });

  it("cuenta como atrasado lo programado para antes de hoy y sin publicar", () => {
    const counts = countPieces([piece({ status: "PROGRAMADO", plannedDate: "2026-08-10" })], TODAY);
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
});

describe("countByStatus", () => {
  it("devuelve los cinco estados aunque estén a cero", () => {
    // Una columna vacía es información: "no tengo nada grabado".
    const counts = countByStatus([piece({ status: "IDEA" })]);
    expect(counts).toEqual({ IDEA: 1, GRABADO: 0, EDITADO: 0, PROGRAMADO: 0, PUBLICADO: 0 });
  });
});
