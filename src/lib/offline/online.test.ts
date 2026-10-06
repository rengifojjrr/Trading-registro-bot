import { describe, expect, it } from "vitest";

import { sinRed } from "./online";

describe("¿hay red?", () => {
  it("en el servidor nunca dice que no (aunque exista navigator sin onLine)", () => {
    expect(sinRed({ window: undefined, navigator: {} })).toBe(false);
    expect(sinRed({ window: undefined, navigator: { onLine: false } })).toBe(false);
  });

  it("en el navegador, sólo con onLine en falso", () => {
    expect(sinRed({ window: {}, navigator: { onLine: false } })).toBe(true);
    expect(sinRed({ window: {}, navigator: { onLine: true } })).toBe(false);
    expect(sinRed({ window: {}, navigator: {} })).toBe(false);
  });
});
