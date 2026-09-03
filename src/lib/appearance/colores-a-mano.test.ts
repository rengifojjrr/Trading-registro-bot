import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ningún color escrito a mano en las pantallas.
 *
 * Es la regla de la que depende todo lo demás: si queda un `#3b82f6` suelto,
 * esa pantalla se rompe en cuanto alguien cambie de paleta, y no se entera
 * nadie hasta que un usuario lo dice. Comprobarlo una vez no sirve -- el
 * siguiente componente lo vuelve a meter -- así que se comprueba siempre.
 *
 * Las excepciones de abajo están una por una y con su motivo. Si esta lista
 * crece sin motivo, el sistema de apariencia ya no vale para nada.
 */

const RAIZ = join(process.cwd(), "src");

const PERMITIDOS = new Map<string, string>([
  [
    "lib/appearance/palettes.ts",
    "Es el archivo de tokens de las paletas: los colores son su contenido.",
  ],
  [
    "lib/charts/tema-canvas.ts",
    "Los respaldos del <canvas>, en un solo sitio para todas las gráficas. " +
      "Un canvas no puede leer variables CSS: lee los tokens computados y " +
      "sólo cae a estos literales sin hoja de estilo, cosa que en un " +
      "navegador de verdad no pasa. Tenerlos aquí es lo que permite que " +
      "ningún componente de gráfico los copie.",
  ],
  [
    "components/trades/trade-chart.tsx",
    "Un <canvas> no puede leer variables CSS. Lee los tokens computados del " +
      "DOM y sólo cae a estos literales si no hay hoja de estilo, cosa que en " +
      "un navegador de verdad no pasa. Aparte, los dos colores de dibujo son " +
      "el valor por defecto de una columna: son datos del usuario, no tema.",
  ],
  [
    "app/global-error.tsx",
    "Sustituye el documento entero, <html> incluido, cuando ha fallado hasta " +
      "el layout. No puede contar con que haya llegado ninguna hoja de estilo, " +
      "así que sus colores tienen que viajar con él.",
  ],
  [
    "app/manifest.ts",
    "Android lee el manifiesto desde fuera del navegador, sin CSS: el color " +
      "de la barra de estado tiene que ser un literal. Y es el mismo de la " +
      "marca, no el de la paleta elegida -- el icono de una aplicación " +
      "instalada no cambia porque cambies de paleta dentro.",
  ],
  [
    "app/offline/page.tsx",
    "Es la única página que se ve sin red, así que no puede contar con que " +
      "haya llegado ninguna hoja de estilo. Sus colores viajan con ella, por " +
      "el mismo motivo que los de global-error.tsx.",
  ],
  [
    "app/layout.tsx",
    "`themeColor` va al <meta> que lee el sistema operativo para pintar la " +
      "barra de estado, fuera del alcance del CSS. Es el único literal del " +
      "archivo y es el mismo de la marca.",
  ],
  [
    "components/trades/drawing-settings.tsx",
    "La paleta que se ofrece para los dibujos del gráfico. El color de una " +
      "línea de tendencia lo elige quien dibuja y se guarda con el dibujo: es " +
      "un dato del usuario, igual que el color de una etiqueta de Notion, no " +
      "una decisión de diseño de esta aplicación. Cambiar de paleta no puede " +
      "cambiar de color un dibujo que alguien pintó de rojo a propósito.",
  ],
  [
    "lib/charts/style.ts",
    "Los colores de fábrica de cada herramienta, que son datos del dibujo por " +
      "el mismo motivo. El verde de la posición larga y el rojo de la corta " +
      "son convención de trading, no tema: en cualquier paleta, una posición " +
      "larga se pinta verde.",
  ],
  [
    "components/trades/indicator-pane.tsx",
    "Los colores de respaldo del panel de indicadores, para cuando " +
      "`getComputedStyle` no devuelve el token -- que en un navegador de " +
      "verdad no pasa, pero en una captura de miniatura o en una prueba sí. " +
      "No son una paleta: es el último recurso para que el panel se dibuje en " +
      "vez de quedarse en blanco, igual que el respaldo del tema del gráfico.",
  ],
  [
    "core/notion-colors.ts",
    "Traduce los nombres de color de Notion a algo pintable. El color de una " +
      "etiqueta lo eligió una persona en Notion: es un dato, no una decisión " +
      "de diseño de esta aplicación.",
  ],
]);

const COLOR_A_MANO = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    if (!/\.tsx?$/.test(nombre) || /\.test\.tsx?$/.test(nombre)) return [];
    return [ruta];
  });
}

describe("colores escritos a mano", () => {
  it("no queda ninguno fuera de los archivos de tokens", () => {
    const encontrados: string[] = [];

    for (const ruta of archivos(RAIZ)) {
      const relativa = relative(RAIZ, ruta).replaceAll("\\", "/");
      if (PERMITIDOS.has(relativa)) continue;

      const lineas = readFileSync(ruta, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (COLOR_A_MANO.test(linea)) encontrados.push(`${relativa}:${i + 1} → ${linea.trim()}`);
      });
    }

    expect(encontrados).toEqual([]);
  });

  it("cada excepción sigue existiendo y sigue teniendo su motivo", () => {
    // Una excepción para un archivo que ya no existe es una excepción que
    // nadie ha vuelto a leer.
    for (const [relativa, motivo] of PERMITIDOS) {
      expect(() => statSync(join(RAIZ, relativa)), relativa).not.toThrow();
      expect(motivo.length, relativa).toBeGreaterThan(40);
    }
  });
});
