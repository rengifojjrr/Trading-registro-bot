import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Que el efectivo del simulador salga del libro y no de una columna.
 *
 * Esto vigila un fallo que estuvo semanas acuñando dinero sin parecer un
 * fallo. La posición se escribía vela a vela y el efectivo de la cuenta una
 * sola vez al final del ciclo; un ciclo que muriera entre las dos cosas
 * dejaba la posición abierta y el efectivo sin descontar, y el ciclo
 * siguiente sumaba las dos. Dos bots se inventaron 7.650 y 6.522 dólares, y
 * un tercero se quedó a cero teniendo 4.489 -- y en la pantalla se veía como
 * estrategias que ganaban dinero.
 *
 * `runner.ts` no se puede probar sin una base de datos, así que lo que se
 * comprueba aquí es lo único que se puede comprobar leyendo: que el ciclo no
 * vuelva a arrancar del saldo guardado. Basta con que alguien «simplifique»
 * la derivación a un `Number(cuenta.efectivo)` para recuperar el fallo
 * entero, y leyendo el archivo por encima no se ve.
 */

const fuente = readFileSync(join(process.cwd(), "src/lib/paper/runner.ts"), "utf8");

/** El código sin comentarios: lo que de verdad se ejecuta. */
const codigo = fuente.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");

describe("el efectivo de un ciclo sale del libro", () => {
  it("el ciclo arranca de la derivación, no del saldo guardado", () => {
    expect(codigo).toMatch(/let\s+efectivo\s*=\s*await\s+efectivoSegunLibro\(/);
  });

  it("no lee `cuenta.efectivo` en ninguna parte", () => {
    // La columna se sigue escribiendo --la pantalla la lee-- pero nada del
    // ciclo puede volver a depender de ella.
    expect(codigo).not.toMatch(/cuenta\.efectivo/);
  });

  it("la derivación es capital + lo realizado - lo que cuesta la abierta", () => {
    const cuerpo = codigo.slice(codigo.indexOf("async function efectivoSegunLibro"));

    expect(cuerpo).toContain("capital_asignado");
    // De `paper_trades`, que es el libro: las cerradas son las que ya
    // movieron dinero de verdad.
    expect(cuerpo).toMatch(/from\("paper_trades"\)/);
    expect(cuerpo).toMatch(/-\s*costeAbierta/);
  });

  it("la posición sigue escribiéndose antes que la cuenta, y da igual", () => {
    // El orden no cambió y no hace falta que cambie: lo que arregla el fallo
    // es que el ciclo siguiente no dependa de lo que la cuenta llegara a
    // guardar. Si alguien invierte esto creyendo que ahí estaba el problema,
    // que sepa que no.
    const apertura = codigo.indexOf("escribirApertura");
    const cuenta = codigo.indexOf('from("paper_accounts")\n    .update');
    expect(apertura).toBeGreaterThan(-1);
    if (cuenta > -1) expect(apertura).toBeLessThan(cuenta);
  });
});
