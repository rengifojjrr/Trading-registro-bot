import { describe, expect, it } from "vitest";

import { MODULES, moduleForPath } from "./registry";

describe("moduleForPath", () => {
  it("reconoce la raíz de un módulo", () => {
    expect(moduleForPath("/sueno")?.id).toBe("sleep");
  });

  it("una sección interna sigue perteneciendo a su módulo", () => {
    expect(moduleForPath("/sueno/analisis")?.id).toBe("sleep");
  });

  it("las páginas de trading son de trading aunque no cuelguen de /trading", () => {
    // /trades, /journal y compañía son suyas pero viven en la raíz.
    expect(moduleForPath("/trades")?.id).toBe("trading");
    expect(moduleForPath("/journal")?.id).toBe("trading");
    expect(moduleForPath("/reconciliation")?.id).toBe("trading");
  });

  it("una ruta hija de una página de trading también cuenta", () => {
    expect(moduleForPath("/trades/abc-123")?.id).toBe("trading");
  });

  it("Hoy y las páginas de sistema no pertenecen a ningún módulo", () => {
    expect(moduleForPath("/")).toBeNull();
    expect(moduleForPath("/settings")).toBeNull();
    expect(moduleForPath("/activity")).toBeNull();
  });

  it("no confunde un prefijo parcial con una sección", () => {
    // /suenos no es /sueno.
    expect(moduleForPath("/suenos")).toBeNull();
  });

  it("cada módulo declara al menos una sección y la primera es su portada", () => {
    for (const mod of MODULES) {
      expect(mod.sections.length).toBeGreaterThan(0);
      expect(mod.sections[0].href).toBe(mod.href);
    }
  });
});
