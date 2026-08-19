import { describe, expect, it } from "vitest";

import {
  appearanceAttributes,
  DEFAULT_APPEARANCE,
  parseAppearance,
  parsePalette,
  parseTheme,
  SURFACE_OPTIONS,
} from "./catalog";

describe("catálogo", () => {
  it("de fábrica el tema es automático, no oscuro", () => {
    // Si alguien ya le dijo a su sistema cómo quiere ver las cosas, la
    // primera visita no tiene por qué llevarle la contraria.
    expect(DEFAULT_APPEARANCE.theme).toBe("auto");
  });

  it("una preferencia que ya no existe cae al valor de fábrica", () => {
    // El caso real: quitamos una paleta y alguien la tenía elegida. Su
    // elección deja de existir; la página no.
    expect(parsePalette("turquesa-de-2019")).toBe(DEFAULT_APPEARANCE.palette);
    expect(parseTheme("")).toBe(DEFAULT_APPEARANCE.theme);
    expect(parsePalette(null)).toBe(DEFAULT_APPEARANCE.palette);
    expect(parsePalette(undefined)).toBe(DEFAULT_APPEARANCE.palette);
  });

  it("un eje roto no arrastra a los otros cuatro", () => {
    const apariencia = parseAppearance({
      palette: "bosque",
      theme: "basura",
      surface: "vidrio",
      corners: "redondas",
      density: "amplia",
    });

    expect(apariencia).toEqual({
      palette: "bosque",
      theme: "auto",
      surface: "vidrio",
      corners: "redondas",
      density: "amplia",
    });
  });

  it("los estilos que difuminan el fondo van marcados como pesados", () => {
    // Es la etiqueta honesta de coste: quien elige tiene derecho a saber que
    // con una tabla de cientos de filas se va a notar al desplazar.
    const pesados = SURFACE_OPTIONS.filter((o) => o.cost === "pesado").map((o) => o.value);
    expect(pesados).toEqual(["vidrio", "halo"]);
    expect(SURFACE_OPTIONS.every((o) => o.cost !== undefined)).toBe(true);
  });

  it("cada opción trae su nombre y su frase", () => {
    expect(SURFACE_OPTIONS.every((o) => o.label.length > 0 && o.hint.length > 0)).toBe(true);
  });
});

describe("atributos de <html>", () => {
  it("el tema automático no deja atributo", () => {
    // Es lo que permite que decida `prefers-color-scheme`. Un
    // `data-theme="auto"` obligaría al CSS a resolver un tercer valor que no
    // sabe resolver.
    const atributos = appearanceAttributes({ ...DEFAULT_APPEARANCE, theme: "auto" });
    expect(atributos["data-theme"]).toBeUndefined();
    expect(atributos["data-paleta"]).toBe("pizarra");
  });

  it("elegir a mano sí deja marca, en inglés como el resto del CSS", () => {
    expect(appearanceAttributes({ ...DEFAULT_APPEARANCE, theme: "claro" })["data-theme"]).toBe("light");
    expect(appearanceAttributes({ ...DEFAULT_APPEARANCE, theme: "oscuro" })["data-theme"]).toBe("dark");
  });

  it("los otros cuatro ejes siempre van puestos", () => {
    const atributos = appearanceAttributes({
      palette: "indigo",
      theme: "auto",
      surface: "halo",
      corners: "rectas",
      density: "compacta",
    });

    expect(atributos).toEqual({
      "data-paleta": "indigo",
      "data-superficie": "halo",
      "data-esquinas": "rectas",
      "data-densidad": "compacta",
    });
  });
});
