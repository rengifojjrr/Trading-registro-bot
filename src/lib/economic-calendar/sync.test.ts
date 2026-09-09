import { describe, expect, it } from "vitest";

import { chunks } from "./sync";

const DIA = 86_400_000;

describe("chunks", () => {
  it("parte la ventana en tramos de sesenta días como mucho", () => {
    // La fuente corta en 2000 resultados sin decirlo. Un tramo de más de
    // sesenta días para un país corre el riesgo de rozar ese tope, y el
    // resultado de rozarlo son huecos silenciosos en la agenda.
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-12-31T00:00:00.000Z");

    const tramos = chunks(from, to);

    expect(tramos.length).toBeGreaterThan(1);
    for (const tramo of tramos) {
      const dias = (new Date(tramo.to).getTime() - new Date(tramo.from).getTime()) / DIA;
      expect(dias).toBeLessThanOrEqual(60);
    }
  });

  it("cubre la ventana entera, sin huecos ni solapes", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-07-15T00:00:00.000Z");

    const tramos = chunks(from, to);

    expect(tramos[0].from).toBe(from.toISOString());
    expect(tramos.at(-1)!.to).toBe(to.toISOString());
    for (let i = 1; i < tramos.length; i++) {
      expect(tramos[i].from).toBe(tramos[i - 1].to);
    }
  });

  it("una ventana corta es un solo tramo", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-20T00:00:00.000Z");

    expect(chunks(from, to)).toEqual([{ from: from.toISOString(), to: to.toISOString() }]);
  });

  it("una ventana vacía o invertida no pide nada", () => {
    const d = new Date("2026-09-01T00:00:00.000Z");
    expect(chunks(d, d)).toEqual([]);
    expect(chunks(new Date("2026-09-10T00:00:00.000Z"), d)).toEqual([]);
  });
});
