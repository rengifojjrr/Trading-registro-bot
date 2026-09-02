import { describe, expect, it } from "vitest";

import { MODULES, allSections, moduleById, moduleForPath, sectionForPath } from "./registry";

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

  it("las pantallas de bots son de trading", () => {
    expect(moduleForPath("/bots")?.id).toBe("trading");
    expect(moduleForPath("/bots/riesgo")?.id).toBe("trading");
    expect(moduleForPath("/bots/abc-123")?.id).toBe("trading");
  });
});

describe("sectionForPath", () => {
  const trading = moduleById("trading");

  it("una sección sin submenú no tiene padre", () => {
    const match = sectionForPath(trading, "/trades/abc");
    expect(match?.section.label).toBe("Operaciones");
    expect(match?.parent).toBeNull();
  });

  it("dentro de un submenú devuelve la hija y quién la abre", () => {
    const match = sectionForPath(trading, "/bots/equipo");
    expect(match?.section.label).toBe("Equipo");
    expect(match?.parent?.label).toBe("Bots");
  });

  it("en la portada del submenú gana la hija, no la sección que lo abre", () => {
    const match = sectionForPath(trading, "/bots");
    expect(match?.section.label).toBe("Resumen");
    expect(match?.parent?.label).toBe("Bots");
  });

  it("la ficha de un bot cuelga de la portada del submenú", () => {
    const match = sectionForPath(trading, "/bots/9f3c");
    expect(match?.section.href).toBe("/bots");
    expect(match?.parent?.label).toBe("Bots");
  });

  it("fuera del módulo no hay sección", () => {
    expect(sectionForPath(trading, "/sueno")).toBeNull();
  });

  it("cada submenú empieza por su propia portada", () => {
    for (const mod of MODULES) {
      for (const section of mod.sections) {
        if (section.children) expect(section.children[0].href).toBe(section.href);
      }
    }
  });

  it("allSections incluye las hijas", () => {
    expect(allSections(trading).map((s) => s.href)).toContain("/bots/cantera");
  });
});
