import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE } from "./catalog";
import { APPEARANCE_COOKIES, appearanceCookieValue, readAppearance } from "./storage";

function lector(cookies: Record<string, string>) {
  return (name: string) => cookies[name];
}

describe("apariencia guardada", () => {
  it("sin nada guardado, los valores de fábrica", () => {
    expect(readAppearance(lector({}))).toEqual(DEFAULT_APPEARANCE);
  });

  it("lee cada eje de su propia cookie", () => {
    const apariencia = readAppearance(
      lector({
        [APPEARANCE_COOKIES.palette]: "pergamino",
        [APPEARANCE_COOKIES.theme]: "claro",
        [APPEARANCE_COOKIES.surface]: "bisel",
        [APPEARANCE_COOKIES.corners]: "redondas",
        [APPEARANCE_COOKIES.density]: "compacta",
      }),
    );

    expect(apariencia).toEqual({
      palette: "pergamino",
      theme: "claro",
      surface: "bisel",
      corners: "redondas",
      density: "compacta",
    });
  });

  it("una cookie con basura no se lleva por delante a las demás", () => {
    const apariencia = readAppearance(
      lector({ [APPEARANCE_COOKIES.palette]: "<script>", [APPEARANCE_COOKIES.density]: "amplia" }),
    );

    expect(apariencia.palette).toBe(DEFAULT_APPEARANCE.palette);
    expect(apariencia.density).toBe("amplia");
  });

  it("respeta la elección hecha con el interruptor viejo", () => {
    // Antes de esto sólo había claro y oscuro, guardados como `light` y
    // `dark`. Quien ya había elegido no tiene por qué perderlo porque
    // hayamos cambiado el sistema por dentro.
    expect(readAppearance(lector({ "trading-registro-theme": "light" })).theme).toBe("claro");
    expect(readAppearance(lector({ "trading-registro-theme": "dark" })).theme).toBe("oscuro");
  });

  it("una elección nueva le gana a la vieja", () => {
    const apariencia = readAppearance(
      lector({ "trading-registro-theme": "dark", [APPEARANCE_COOKIES.theme]: "auto" }),
    );
    expect(apariencia.theme).toBe("auto");
  });

  it("la cookie dura un año y no se va al cerrar el navegador", () => {
    const cookie = appearanceCookieValue("palette", "indigo");
    expect(cookie).toContain("apariencia-paleta=indigo");
    expect(cookie).toContain("max-age=31536000");
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("samesite=lax");
  });

  it("cada eje tiene su propia cookie", () => {
    // Con un único valor empaquetado, guardar el tema reescribe también la
    // paleta, y dos pestañas cambiando cosas distintas se pisan.
    const nombres = Object.values(APPEARANCE_COOKIES);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
