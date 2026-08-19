import { describe, expect, it } from "vitest";

import { longDateLabel, nightOf, shiftDate, todayIn } from "./today";

describe("todayIn", () => {
  it("usa la zona del usuario, no UTC", () => {
    // 03:00 UTC del día 20 es todavía el 19 en Bogotá.
    const at = new Date("2026-08-20T03:00:00Z");
    expect(todayIn("America/Bogota", at)).toBe("2026-08-19");
    expect(todayIn("UTC", at)).toBe("2026-08-20");
  });

  it("cae en UTC si la zona no es válida en lugar de romper", () => {
    const at = new Date("2026-08-20T03:00:00Z");
    expect(todayIn("No/Existe", at)).toBe("2026-08-20");
  });
});

describe("nightOf", () => {
  it("dormirse de madrugada cuenta como la noche anterior", () => {
    const at = new Date("2026-08-20T07:00:00Z"); // 02:00 en Bogotá del día 20
    expect(nightOf(at, "America/Bogota")).toBe("2026-08-19");
  });

  it("dormirse por la noche cuenta como esa misma fecha", () => {
    const at = new Date("2026-08-20T04:00:00Z"); // 23:00 en Bogotá del día 19
    expect(nightOf(at, "America/Bogota")).toBe("2026-08-19");
  });

  it("una siesta de la tarde cuenta como ese día", () => {
    const at = new Date("2026-08-20T20:00:00Z"); // 15:00 en Bogotá del día 20
    expect(nightOf(at, "America/Bogota")).toBe("2026-08-20");
  });
});

describe("shiftDate", () => {
  it("retrocede cruzando el cambio de mes", () => {
    expect(shiftDate("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("longDateLabel", () => {
  it("escribe la fecha en español con mayúscula inicial", () => {
    expect(longDateLabel("2026-08-19")).toBe("Miércoles, 19 de agosto");
  });
});
