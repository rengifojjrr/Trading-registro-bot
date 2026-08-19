import { describe, expect, it } from "vitest";

import { appearanceStylesheet, paletteRules } from "./css";
import { PALETTES } from "./catalog";
import { PALETTE_COLORS } from "./palettes";

describe("hoja de estilo de las paletas", () => {
  it("cada paleta se define en los tres estados", () => {
    const css = paletteRules("pizarra");

    // 1 · sin condiciones: los valores de día.
    expect(css).toContain(':root:root[data-paleta="pizarra"]{');
    // 2 · el sistema pide oscuro y nadie eligió claro a mano.
    expect(css).toContain(
      '@media (prefers-color-scheme:dark){:root:root[data-paleta="pizarra"]:not([data-theme="light"]){',
    );
    // 3 · alguien eligió oscuro a mano.
    expect(css).toContain(':root:root[data-paleta="pizarra"][data-theme="dark"]{');
  });

  it("ningún color tiene su única definición dentro de un @media", () => {
    // La regla que más se incumple: si un token sólo existe bajo la consulta
    // de medios, en el estado sin marcar no se aplica y acabas pintando el
    // texto de un tema sobre el fondo del otro.
    for (const palette of PALETTES) {
      const sinCondiciones = paletteRules(palette).split("@media")[0];
      for (const token of Object.keys(PALETTE_COLORS[palette].dark)) {
        expect(sinCondiciones, `${palette} · --${token}`).toContain(`--${token}:`);
      }
    }
  });

  it("los dos estados oscuros llevan exactamente los mismos valores", () => {
    // Si se separan, elegir «oscuro» a mano deja de verse igual que tener el
    // sistema en oscuro, y nadie entiende por qué.
    for (const palette of PALETTES) {
      const css = paletteRules(palette);
      const bloques = [...css.matchAll(/\{(--[^{}]+)\}/g)].map((m) => m[1]);
      expect(bloques).toHaveLength(3);
      expect(bloques[1]).toBe(bloques[2]);
      expect(bloques[0]).not.toBe(bloques[1]);
    }
  });

  it("las dos caras de cada paleta definen los mismos tokens", () => {
    // Un token definido sólo de día se queda con el valor de día por la
    // noche: el fallo llega como «este texto no se lee», no como un error.
    for (const palette of PALETTES) {
      const { light, dark } = PALETTE_COLORS[palette];
      expect(Object.keys(dark).sort(), palette).toEqual(Object.keys(light).sort());
    }
  });

  it("el selector lleva :root repetido para no depender del orden de las hojas", () => {
    // El orden del CSS en Next.js sale del orden de los `import` y puede no
    // coincidir entre desarrollo y build. Empatar en especificidad con
    // globals.css sería una paleta que funciona al desarrollar y se cae al
    // desplegar.
    expect(paletteRules("carbon").startsWith(':root:root[data-paleta="carbon"]{')).toBe(true);
  });

  it("el texto secundario no es el mismo que el principal en ninguna de las dos caras", () => {
    // Invertir los valores de día para hacer el tema oscuro produce siempre
    // esto: el texto secundario, que de día se aclara para bajar de
    // jerarquía, de noche acaba siendo lo más brillante de la pantalla.
    for (const palette of PALETTES) {
      const { light, dark } = PALETTE_COLORS[palette];
      expect(light["muted-foreground"], palette).not.toBe(light.foreground);
      expect(dark["muted-foreground"], palette).not.toBe(dark.foreground);
      expect(dark["muted-foreground"], palette).not.toBe(light["muted-foreground"]);
    }
  });

  it("ninguna paleta define colores de estado ni tonos de módulo", () => {
    // «Correcto», «atención» y «error» significan lo mismo con cualquier
    // paleta: no son decoración, son señales. Y confundir una pérdida con una
    // ganancia es el único error que esta aplicación no se puede permitir.
    const css = appearanceStylesheet();
    for (const token of ["--positive", "--negative", "--warning", "--destructive", "--mod-"]) {
      expect(css, token).not.toContain(token);
    }
  });

  it("están las cinco paletas", () => {
    const css = appearanceStylesheet();
    for (const palette of PALETTES) {
      expect(css).toContain(`[data-paleta="${palette}"]`);
    }
  });

  it("la paleta de casa reproduce los colores que ya había", () => {
    // Quien no toque nada tiene que ver exactamente lo mismo que antes.
    expect(PALETTE_COLORS.pizarra.dark.background).toBe("hsl(222 47% 6%)");
    expect(PALETTE_COLORS.pizarra.light.background).toBe("hsl(210 40% 98%)");
    expect(PALETTE_COLORS.pizarra.dark.primary).toBe("hsl(199 89% 48%)");
  });
});
