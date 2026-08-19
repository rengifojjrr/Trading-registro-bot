import { describe, expect, it } from "vitest";

import { COLOR_LABELS, PROJECT_COLORS, colorCss, colorForName } from "./notion-colors";

describe("colorForName", () => {
  it("da siempre el mismo color al mismo nombre", () => {
    // Es lo que permite derivarlo al leer en lugar de guardarlo: si cambiara
    // entre visitas, el proyecto cambiaría de color cada vez que se recarga.
    expect(colorForName("Trading")).toBe(colorForName("Trading"));
    expect(colorForName("Aquavita")).toBe(colorForName("Aquavita"));
  });

  it("nunca devuelve «sin color»", () => {
    // Un color asignado que resulta ser gris no se distingue de no haber
    // asignado ninguno.
    for (const name of ["Trading", "Miami", "Joel", "Aquavita", "Casas Gaspirilla", ""]) {
      expect(colorForName(name)).not.toBe("default");
    }
  });

  it("devuelve un color de la paleta", () => {
    for (const name of ["Trendy Sports", "Financial University", "Finenproc"]) {
      expect(PROJECT_COLORS).toContain(colorForName(name));
    }
  });

  it("reparte tus diez proyectos en más de un color", () => {
    // Diez proyectos que salieran todos del mismo tono serían lo mismo que no
    // tener colores.
    const proyectos = [
      "Aquavita",
      "Casas Gaspirilla",
      "Curso de trading",
      "Financial University",
      "Finenproc",
      "Joel",
      "Miami",
      "Redes sociales",
      "Trading",
      "Trendy Sports",
    ];
    const colores = new Set(proyectos.map(colorForName));
    expect(colores.size).toBeGreaterThanOrEqual(5);
  });

  it("aguanta acentos y emoji sin romperse", () => {
    expect(PROJECT_COLORS).toContain(colorForName("Diseño 🎨"));
  });
});

describe("colorCss", () => {
  it("da un HSL válido para cada color", () => {
    for (const color of PROJECT_COLORS) {
      expect(colorCss(color)).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    }
  });

  it("aclara sobre fondo oscuro", () => {
    // El mismo tono se ve distinto sobre papel y sobre fondo oscuro; con una
    // sola luminosidad, uno de los dos queda ilegible.
    expect(colorCss("brown", false)).not.toBe(colorCss("brown", true));
  });

  it("trata la ausencia de color como «sin color»", () => {
    expect(colorCss(null)).toBe(colorCss("default"));
    expect(colorCss(undefined)).toBe(colorCss("default"));
  });
});

describe("COLOR_LABELS", () => {
  it("nombra los diez colores en castellano", () => {
    for (const color of PROJECT_COLORS) {
      expect(COLOR_LABELS[color]).toBeTruthy();
    }
  });
});
