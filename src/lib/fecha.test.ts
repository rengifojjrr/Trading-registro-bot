import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DateTime } from "./fecha";

/**
 * Que la aplicación no vuelva a escribir los meses en el idioma de la máquina.
 *
 * Luxon sin idioma usa el del sistema. En este servidor es `en-US`, así que la
 * mitad de la aplicación llevaba meses poniendo «Jan», «Apr», «Aug», «Dec» --y
 * en septiembre, que es cuando se miró, «Sep», que se escribe igual en los dos
 * idiomas y por eso no se vio--. Y lo peor no era el idioma sino que dependía
 * de la máquina: la misma fecha podía salir distinta en el servidor y en el
 * navegador.
 *
 * Hay dos cierres y aquí se comprueban los dos:
 *
 * 1. `@/lib/fecha` deja el idioma puesto, y una regla de eslint impide
 *    importar `luxon` por otro sitio. Lo de abajo comprueba que sigue puesto
 *    -- la regla vigila de dónde se importa, no qué hace lo importado.
 * 2. `Intl` y `toLocaleString` no pasan por luxon, así que se miran a mano.
 */

describe("@/lib/fecha trae el idioma puesto", () => {
  const enero = DateTime.fromISO("2026-01-03T10:00:00Z", { zone: "utc" });

  it("escribe los meses en español", () => {
    // El mes que más se nota: «ene» contra «Jan».
    expect(enero.toFormat("LLL")).toBe("ene");
  });

  it("y los días", () => {
    expect(enero.toFormat("cccc")).toBe("sábado");
  });

  it("no depende de que la máquina hable español", () => {
    // Si esto falla es que alguien quitó el `Settings.defaultLocale` y el test
    // de arriba está pasando de milagro, porque el sistema resulta ser `es`.
    expect(enero.locale).toBe("es");
  });
});

const RAIZ = "src";

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.tsx?$/.test(ruta) ? [ruta] : [];
  });
}

describe("nada se apoya en el idioma de la máquina", () => {
  /**
   * `toLocaleString()` sin idioma, y `Intl.*Format(undefined, ...)`.
   *
   * Las dos formas dicen «el idioma que tenga quien ejecute esto», que en un
   * servidor no es el de nadie. Se escriben así sin querer: es lo que sale de
   * escribir la llamada corta.
   *
   * Pasar `undefined` como zona sí es legítimo --`Intl.DateTimeFormat(undefined,
   * { timeZone })` es cómo se comprueba que una zona existe--, así que lo que
   * se busca es el idioma ausente, no el argumento ausente: `Intl` con
   * `undefined` de idioma se acepta cuando lo que se mira es la zona.
   */
  const SIN_IDIOMA =
    /toLocale(?:Date|Time)?String\(\s*(?:undefined\s*[,)]|\))|Intl\.(?:DateTimeFormat|NumberFormat)\(\s*undefined\s*,\s*\{(?![^}]*timeZone)/g;

  const culpables = ficheros(RAIZ).flatMap((f) => {
    // Este fichero no: la expresión de arriba se encuentra a sí misma.
    if (f.endsWith("fecha.test.ts")) return [];
    const src = readFileSync(f, "utf8");
    return [...src.matchAll(SIN_IDIOMA)].map(
      (m) => `${f}:${src.slice(0, m.index).split("\n").length}`,
    );
  });

  it("ningún fichero formatea sin decir en qué idioma", () => {
    expect(culpables).toEqual([]);
  });
});
