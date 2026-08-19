import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CORNERS, DENSITIES, SURFACES } from "./catalog";

/**
 * Lo que no se puede comprobar leyendo el CSS a ojo.
 *
 * Los dos bloques oscuros están duplicados por obligación -- CSS no tiene
 * forma de reutilizar un juego de declaraciones sin trucos ilegibles -- y una
 * duplicación que nadie vigila se desincroniza. El día que pase, elegir
 * «oscuro» a mano dejará de verse igual que tener el sistema en oscuro, y no
 * habrá ningún error: sólo un color raro que alguien acabará notando meses
 * después.
 */

// Sin los comentarios: este archivo explica su propia estructura citando los
// selectores, y buscarlos literalmente encontraría antes la explicación que
// la regla.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Las declaraciones de custom properties de un bloque, normalizadas. */
function declarations(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, token, value] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
    found.set(token, value.trim());
  }
  return found;
}

/** El cuerpo del bloque que abre con este selector. */
function blockFor(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `no encuentro «${selector}» en globals.css`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

const claro = declarations(blockFor(":root {"));
const oscuroSistema = declarations(blockFor(':root:not([data-theme="light"])'));
const oscuroElegido = declarations(blockFor(':root[data-theme="dark"] {'));

describe("los tres estados del tema", () => {
  it("los dos bloques oscuros son idénticos", () => {
    expect(Object.fromEntries(oscuroElegido)).toEqual(Object.fromEntries(oscuroSistema));
  });

  it("hay algo que comparar", () => {
    // Si el parseo se rompiera, la comparación de arriba pasaría comparando
    // dos mapas vacíos.
    expect(oscuroSistema.size).toBeGreaterThan(20);
  });

  it("ningún color tiene su única definición dentro de un @media o un [data-theme]", () => {
    // El fallo que sale de saltarse esto no es un error: es el texto de un
    // tema pintado sobre el fondo del otro, en el estado sin marcar.
    for (const token of oscuroSistema.keys()) {
      expect(claro.has(token), `--${token} sólo existe de noche`).toBe(true);
    }
  });

  it("el tema oscuro no es el claro invertido", () => {
    // Invertir produce siempre el mismo tema oscuro malo: el texto
    // secundario, que de día se aclara para bajar de jerarquía, de noche
    // acaba siendo lo más brillante de la pantalla.
    expect(oscuroSistema.get("--muted-foreground")).not.toBe(claro.get("--muted-foreground"));
    expect(oscuroSistema.get("--muted-foreground")).not.toBe(oscuroSistema.get("--foreground"));
  });

  it("los colores de estado están definidos en los dos temas", () => {
    for (const token of ["--positive", "--negative", "--warning", "--destructive"]) {
      expect(claro.has(token), token).toBe(true);
      expect(oscuroSistema.has(token), token).toBe(true);
    }
  });

  it("el fondo del body sale de un token, no del navegador", () => {
    // Un `<body>` transparente hereda el fondo del navegador y rompe uno de
    // los dos temas.
    expect(css).toMatch(/body\s*\{[^}]*bg-background/);
  });
});

describe("los ejes de forma", () => {
  it("cada opción de esquinas tiene su regla", () => {
    for (const corners of CORNERS) {
      expect(css, corners).toContain(`[data-esquinas="${corners}"]`);
    }
  });

  it("cada densidad tiene su regla", () => {
    for (const density of DENSITIES) {
      expect(css, density).toContain(`[data-densidad="${density}"]`);
    }
  });

  it("la densidad mueve un solo token", () => {
    // Si encoge la escala de espaciado entera, el texto se apelmaza contra
    // los bordes y no ganas ni una fila.
    for (const density of DENSITIES) {
      const tokens = [...declarations(blockFor(`[data-densidad="${density}"]`)).keys()];
      expect(tokens, density).toEqual(["--aire"]);
    }
  });

  it("las esquinas mueven un solo token", () => {
    for (const corners of CORNERS) {
      const tokens = [...declarations(blockFor(`[data-esquinas="${corners}"]`)).keys()];
      expect(tokens, corners).toEqual(["--radius"]);
    }
  });

  it("cada superficie que no es la plana tiene su regla", () => {
    // «Plano» es la tarjeta tal y como viene, así que no necesita ninguna:
    // es contra la que se definen las otras cuatro.
    for (const surface of SURFACES.filter((s) => s !== "plano")) {
      expect(css, surface).toContain(`[data-superficie="${surface}"] [data-slot="card"]`);
    }
    expect(css).not.toContain('[data-superficie="plano"] [data-slot="card"]');
  });

  it("las superficies alcanzan a las tarjetas por su data-slot", () => {
    // Es lo que permite cambiarlas todas sin tocar ninguna pantalla.
    expect(css).toContain('[data-slot="card"]');
  });

  it("las superficies no escriben colores propios", () => {
    // Una superficie con su propio gris se queda con él al cambiar de
    // paleta, que es exactamente lo que este sistema existe para evitar.
    const reglas = SURFACES.filter((s) => s !== "plano").map((s) => {
      const start = css.indexOf(`[data-superficie="${s}"] [data-slot="card"]`);
      return css.slice(start, css.indexOf("}", start));
    });

    for (const regla of reglas) {
      expect(regla, regla.slice(0, 48)).not.toMatch(/#[0-9a-f]{3}|rgba?\(|hsla?\(/i);
    }
  });

  it("el movimiento al cambiar de aspecto se puede desactivar", () => {
    expect(css).toContain("prefers-reduced-motion");
  });
});
