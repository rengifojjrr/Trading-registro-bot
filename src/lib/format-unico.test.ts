import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Un número no puede escribirse de dos maneras en la misma pantalla.
 *
 * `lib/format.ts` existe para eso: cada cifra de la aplicación pasa por ahí y
 * sale igual en las veinte pantallas que la enseñan. Pero formatear a mano es
 * más corto que importar la función, así que seis sitios se lo habían montado
 * por su cuenta con `toLocaleString("es-ES")`. El resultado se veía en una
 * misma fila del gráfico:
 *
 *     A    $76,100.50      <- formatMoney
 *     Máx  $76,250.00      <- formatMoney
 *     Vol   1.234,56       <- toLocaleString("es-ES")
 *
 * Los miles separados con coma en cinco cifras y con punto en la sexta, una
 * debajo de otra. Lo mismo pasaba con los precios del plan --«$68.450» en la
 * encuesta, «$68,450.00» en la pantalla de al lado-- y con el capital del
 * simulador.
 *
 * Esto no impide formatear a mano: impide hacerlo **sin decirlo**. Quien
 * necesite su propia convención se apunta abajo con el motivo, y así la
 * siguiente persona encuentra la decisión en vez de tener que adivinar si fue
 * una o un descuido.
 */

/**
 * Los que sí pueden, y por qué.
 *
 * El calendario económico es el único caso: sus números no los calcula la
 * aplicación, los publica una fuente y se enseñan como los publica --«0,4 %»,
 * con coma--. Es una convención distinta y se sostiene porque no se mezcla:
 * los dos ficheros son los que pintan la misma fila de la ficha de una
 * publicación, el dato macro y el movimiento del precio, y van los dos igual.
 */
const CON_PERMISO = new Map<string, string>([
  [
    "src/lib/economic-calendar/format.ts",
    "el dato macro se enseña como lo publica la fuente, no como lo calcularía la aplicación",
  ],
  [
    "src/lib/economic-calendar/market-reaction.ts",
    "va pegado al dato macro en la misma fila y tiene que escribirse igual que él",
  ],
  // El propio `lib/format.ts`, que es donde vive la convención.
  ["src/lib/format.ts", "es el sitio que decide cómo se escribe un número"],
]);

/** Formatear un número con separadores sin pasar por `@/lib/format`. */
const A_MANO = /toLocaleString\(\s*"[a-z]{2}(?:-[A-Z]{2})?"|Intl\.NumberFormat\(/;

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.tsx?$/.test(ruta) && !/\.test\.tsx?$/.test(ruta) ? [ruta] : [];
  });
}

/**
 * El código sin comentarios.
 *
 * Hace falta: el comentario que explica por qué una línea ya *no* usa
 * `toLocaleString("es-ES")` menciona la llamada, y sin quitar los comentarios
 * este test se quejaba de la explicación de su propio arreglo.
 */
function codigo(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
}

describe("los números se escriben en un solo sitio", () => {
  const sueltos = ficheros("src").filter((f) => {
    if (CON_PERMISO.has(f)) return false;
    // `toLocaleString("es", { month: ... })` es una fecha, no un número, y las
    // fechas tienen su propio guardián en `fecha.test.ts`.
    const sinFechas = codigo(readFileSync(f, "utf8")).replace(
      /toLocaleString\([^)]*\b(month|weekday|day|year|hour)\s*:/g,
      " ",
    );
    return A_MANO.test(sinFechas);
  });

  it("ningún fichero se monta su propio formato de números", () => {
    expect(sueltos).toEqual([]);
  });

  it("y los que tienen permiso siguen existiendo", () => {
    // Si un fichero de la lista desaparece o se arregla, la lista sobra y hay
    // que quitarlo: una excepción que ya no se usa es una que nadie revisa.
    for (const [ruta, motivo] of CON_PERMISO) {
      expect(readFileSync(ruta, "utf8"), `${ruta} (${motivo})`).toBeTruthy();
    }
  });
});
