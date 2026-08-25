import { describe, expect, it } from "vitest";

import {
  burstContaining,
  describeBurst,
  groupIntoBursts,
  multiTradeBursts,
  type BurstTrade,
} from "./bursts";

const BASE = Date.parse("2026-08-25T14:00:00Z");

const op = (id: string, minutosDesdeBase: number, productId = "BIT-31OCT26-CDE"): BurstTrade => ({
  id,
  openedAt: new Date(BASE + minutosDesdeBase * 60000).toISOString(),
  productId,
});

describe("agrupar en ráfagas", () => {
  it("junta las que están pegadas en el tiempo", () => {
    // El caso real: muchas entradas en minutos, que son un episodio y no doce
    // decisiones.
    const bursts = groupIntoBursts([op("a", 0), op("b", 3), op("c", 7), op("d", 12)]);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].tradeIds).toEqual(["a", "b", "c", "d"]);
    expect(bursts[0].spanMinutes).toBe(12);
  });

  it("separa cuando hubo una parada", () => {
    const bursts = groupIntoBursts([op("a", 0), op("b", 5), op("c", 200), op("d", 205)]);
    expect(bursts.map((b) => b.tradeIds)).toEqual([
      ["c", "d"],
      ["a", "b"],
    ]);
  });

  it("no parte una racha larga en trozos por reloj", () => {
    // Dos horas seguidas sin parar son un episodio. Cortar cada treinta
    // minutos inventaría fronteras donde no las hubo: lo que separa dos
    // episodios es haber parado, no que pase el tiempo.
    const seguidas = Array.from({ length: 13 }, (_, i) => op(`t${i}`, i * 10));
    const bursts = groupIntoBursts(seguidas);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].tradeIds).toHaveLength(13);
    expect(bursts[0].spanMinutes).toBe(120);
  });

  it("no mezcla dos productos aunque coincidan en el reloj", () => {
    // Dos instrumentos a la vez son dos decisiones distintas.
    const bursts = groupIntoBursts([
      op("bit1", 0),
      op("eth1", 1, "ETH-31OCT26-CDE"),
      op("bit2", 2),
    ]);
    expect(bursts).toHaveLength(2);
    expect(bursts.find((b) => b.tradeIds.includes("bit1"))?.tradeIds).toEqual(["bit1", "bit2"]);
  });

  it("respeta el hueco que se le pase", () => {
    const trades = [op("a", 0), op("b", 45)];
    expect(groupIntoBursts(trades, 30)).toHaveLength(2);
    expect(groupIntoBursts(trades, 60)).toHaveLength(1);
  });

  it("ignora una fecha que no se puede leer en vez de romperse", () => {
    const bursts = groupIntoBursts([
      { id: "rota", openedAt: "no es fecha", productId: "BIT-31OCT26-CDE" },
      op("buena", 0),
    ]);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].tradeIds).toEqual(["buena"]);
  });

  it("las ráfagas salen de más reciente a más antigua", () => {
    const bursts = groupIntoBursts([op("vieja", 0), op("nueva", 500)]);
    expect(bursts[0].tradeIds).toEqual(["nueva"]);
  });
});

describe("la ráfaga de una operación concreta", () => {
  it("devuelve todas las de su episodio", () => {
    const trades = [op("a", 0), op("b", 4), op("c", 300)];
    expect(burstContaining("b", trades)?.tradeIds).toEqual(["a", "b"]);
  });

  it("devuelve null si esa operación no está", () => {
    expect(burstContaining("fantasma", [op("a", 0)])).toBeNull();
  });
});

describe("solo las ráfagas de verdad", () => {
  it("descarta las operaciones sueltas", () => {
    // Una operación sola no es un episodio, y ofrecer «aplicar a la ráfaga»
    // sobre ella sería ofrecer nada con más pasos.
    const bursts = multiTradeBursts([op("sola", 0), op("a", 300), op("b", 302)]);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].tradeIds).toEqual(["a", "b"]);
  });
});

describe("cómo se describe una ráfaga", () => {
  it("dice cuántas y en cuánto tiempo", () => {
    expect(describeBurst(groupIntoBursts([op("a", 0), op("b", 12)])[0])).toBe(
      "2 operaciones en 12 minutos",
    );
  });

  it("pasa a horas cuando el episodio fue largo", () => {
    const larga = groupIntoBursts(Array.from({ length: 10 }, (_, i) => op(`t${i}`, i * 20)));
    expect(describeBurst(larga[0])).toContain("horas");
  });

  it("habla en singular con una sola", () => {
    expect(describeBurst(groupIntoBursts([op("a", 0)])[0])).toBe("1 operación casi a la vez");
  });
});
