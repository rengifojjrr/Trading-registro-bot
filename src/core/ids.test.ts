import { describe, expect, it } from "vitest";

import { isUuid, uuidv7 } from "./ids";

describe("uuidv7", () => {
  it("es un uuid de versión 7 y variante RFC", () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("7");
    expect("89ab").toContain(id[19]);
  });

  it("lleva la hora delante: dos ids salen en el orden en que se crearon", () => {
    const cero = new Uint8Array(10);
    const antes = uuidv7(1_700_000_000_000, cero);
    const despues = uuidv7(1_700_000_000_001, cero);
    expect(antes < despues).toBe(true);
    expect(antes.slice(0, 13)).toBe("018bcfe5-6800");
  });

  it("dos ids en el mismo milisegundo no se repiten", () => {
    const ids = new Set(Array.from({ length: 500 }, () => uuidv7(1_700_000_000_000)));
    expect(ids.size).toBe(500);
  });
});

describe("isUuid", () => {
  it("dice que no a lo que no es un uuid", () => {
    expect(isUuid("a0000000-0000-4000-8000-0000000000a1")).toBe(true);
    expect(isUuid("no")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid("a0000000-0000-4000-8000-0000000000a1x")).toBe(false);
  });
});
