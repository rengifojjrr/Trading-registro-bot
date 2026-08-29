import { describe, expect, it } from "vitest";

import {
  describeGroupLines,
  findGroupNear,
  groupFillsByTime,
  toleranceFor,
  type ChartFill,
} from "./fills-at-time";

const f = (time: number, price: number, size: number, role: "ENTRY" | "EXIT" = "ENTRY"): ChartFill => ({
  time,
  price,
  size,
  role,
});

describe("agrupar ejecuciones por instante", () => {
  it("junta las del mismo segundo", () => {
    // Coinbase parte una orden en varias ejecuciones del mismo segundo, y seis
    // flechas idénticas sobre la misma vela tapan la vela sin decir nada más.
    const grupos = groupFillsByTime([f(100, 68000, 10), f(100, 68000, 14), f(200, 68500, 5)]);
    expect(grupos.size).toBe(2);
    expect(grupos.get(100)?.fills).toHaveLength(2);
    expect(grupos.get(100)?.entryQty).toBe("24");
  });

  it("pondera el precio por tamaño, no lo promedia a secas", () => {
    // Media aritmética diría 68.500; ponderada dice 68.750, que es lo que de
    // verdad se pagó.
    const grupos = groupFillsByTime([f(100, 68000, 1), f(100, 69000, 3)]);
    expect(grupos.get(100)?.wap).toBe("68750.00");
  });

  it("separa entradas de salidas en el mismo instante", () => {
    // Una vuelta completa en el mismo segundo: llamarla «entrada» o «salida»
    // sería elegir una y esconder la otra.
    const grupos = groupFillsByTime([f(100, 68000, 5, "ENTRY"), f(100, 68000, 3, "EXIT")]);
    const g = grupos.get(100)!;
    expect(g.role).toBeNull();
    expect(g.entryQty).toBe("5");
    expect(g.exitQty).toBe("3");
  });

  it("marca el papel cuando sólo hubo de un tipo", () => {
    expect(groupFillsByTime([f(1, 100, 1, "ENTRY")]).get(1)?.role).toBe("ENTRY");
    expect(groupFillsByTime([f(1, 100, 1, "EXIT")]).get(1)?.role).toBe("EXIT");
  });

  it("aguanta una lista vacía", () => {
    expect(groupFillsByTime([]).size).toBe(0);
  });
});

describe("encontrar lo que hay bajo el cursor", () => {
  const grupos = groupFillsByTime([f(1000, 68000, 5), f(5000, 69000, 3, "EXIT")]);

  it("encuentra el grupo aunque el cursor no caiga en el segundo exacto", () => {
    // El cursor cae sobre una vela, no sobre un segundo: una vela de una hora
    // abarca tres mil seiscientos.
    expect(findGroupNear(grupos, 1030, 60)?.time).toBe(1000);
  });

  it("no encuentra nada fuera de la tolerancia", () => {
    // Señalar la vela de al lado no puede enseñar la ejecución de esta.
    expect(findGroupNear(grupos, 1200, 60)).toBeNull();
  });

  it("con dos cerca, devuelve el más cercano", () => {
    const juntos = groupFillsByTime([f(1000, 1, 1), f(1050, 2, 1)]);
    expect(findGroupNear(juntos, 1040, 100)?.time).toBe(1050);
  });

  it("la tolerancia es media vela", () => {
    expect(toleranceFor(3600)).toBe(1800);
    expect(toleranceFor(60)).toBe(30);
    // Nunca cero: con granularidad de un segundo habría que acertar el píxel.
    expect(toleranceFor(1)).toBe(1);
  });
});

describe("lo que se lee al pasar por encima", () => {
  it("dice qué pasó y a qué precio", () => {
    const g = groupFillsByTime([f(100, 68420, 21, "EXIT")]).get(100)!;
    const lineas = describeGroupLines(g);
    expect(lineas[0]).toBe("Salida de 21");
    expect(lineas[1]).toBe("Precio 68420.00");
  });

  it("no dice «1 ejecución», que sería una línea inútil en casi todos los casos", () => {
    const g = groupFillsByTime([f(100, 68000, 5)]).get(100)!;
    expect(describeGroupLines(g)).toHaveLength(2);
  });

  it("sí lo dice cuando fueron varias", () => {
    const g = groupFillsByTime([f(100, 68000, 5), f(100, 68010, 5)]).get(100)!;
    expect(describeGroupLines(g).join(" ")).toContain("2 ejecuciones");
  });

  it("enseña las dos cantidades cuando hubo entrada y salida a la vez", () => {
    const g = groupFillsByTime([f(100, 1, 5, "ENTRY"), f(100, 1, 2, "EXIT")]).get(100)!;
    expect(describeGroupLines(g)[0]).toBe("Entrada 5 · Salida 2");
  });
});
