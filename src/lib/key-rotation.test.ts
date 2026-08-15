import { describe, expect, it } from "vitest";

import { keyAgeInDays } from "./key-rotation";

describe("keyAgeInDays", () => {
  const now = new Date("2026-08-15T12:00:00Z");

  it("devuelve null cuando nunca se registró una rotación", () => {
    expect(keyAgeInDays(null, now)).toBeNull();
  });

  it("cuenta días completos", () => {
    expect(keyAgeInDays("2026-08-05T12:00:00Z", now)).toBe(10);
  });

  it("una rotación de hoy son cero días, no un día", () => {
    expect(keyAgeInDays("2026-08-15T01:00:00Z", now)).toBe(0);
  });

  it("no rompe con una fecha inválida", () => {
    expect(keyAgeInDays("no es una fecha", now)).toBeNull();
  });
});
