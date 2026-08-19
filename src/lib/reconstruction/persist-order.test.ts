import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * El orden en que `persistReconstruction` escribe.
 *
 * No hay transacción: son N escrituras seguidas contra PostgREST, así que la
 * función puede morirse a la mitad. Cuando eso pasa, lo que importa es en qué
 * estado queda la base de datos, y eso depende enteramente del orden. Dos
 * propiedades lo deciden, las dos se rompieron a la vez, y las dos son
 * invisibles leyendo el archivo por encima -- de ahí este test.
 *
 * El día que fallaron, el panel enseñó +305 dólares en un día en el que se
 * ganaron 152: contaba el largo de 42 contratos y el de 43 al mismo tiempo.
 */

const fuente = readFileSync(
  join(process.cwd(), "src/lib/reconstruction/persist.ts"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

describe("persistReconstruction escribe en el orden correcto", () => {
  it("marca las huérfanas antes de escribir las nuevas", () => {
    // Al revés, morirse a media escritura deja las viejas y las nuevas
    // conviviendo, las dos visibles y las dos sumando. Marcándolas primero,
    // un fallo deja de menos y nunca de más, que en una aplicación que cuenta
    // dinero es la única dirección aceptable.
    const marcado = fuente.indexOf("orphaned_at: new Date().toISOString()");
    const bucle = fuente.indexOf("for (const trade of trades)");

    expect(marcado, "no encuentro el marcado de huérfanas").toBeGreaterThan(-1);
    expect(bucle, "no encuentro el bucle de escritura").toBeGreaterThan(-1);
    expect(marcado).toBeLessThan(bucle);
  });

  it("vacía los enlaces de todo el ámbito antes de escribir, no operación por operación", () => {
    // `trade_fills` lleva UNIQUE (raw_fill_id, role) global. Borrando por
    // operación, la vieja retiene sus enlaces mientras la nueva reclama los
    // mismos, y la escritura revienta con «duplicate key value violates
    // unique constraint trade_fills_raw_fill_id_role_key».
    const limpieza = fuente.indexOf('.in("trade_id", scopeTradeIds)');
    const bucle = fuente.indexOf("for (const trade of trades)");

    expect(limpieza, "no encuentro el vaciado por ámbito").toBeGreaterThan(-1);
    expect(limpieza).toBeLessThan(bucle);
  });

  it("no queda ningún borrado de enlaces por operación suelta", () => {
    expect(fuente).not.toMatch(/from\("trade_fills"\)\s*\.delete\(\)\s*\.eq\("trade_id"/);
  });

  it("el ámbito abarca todas las operaciones del producto, no sólo las que abren algo", () => {
    // La columna sí se selecciona -- hace falta para casar cada operación con
    // su fill de apertura. Lo que no puede volver es el filtro: con
    // `.not("opening_fill_id", "is", null)`, una operación sin fill de
    // apertura quedaría fuera del ámbito, conservaría sus enlaces y volvería a
    // chocar con la siguiente que los reclamara.
    const consulta = fuente.slice(
      fuente.indexOf('.from("trades")'),
      fuente.indexOf("]);", fuente.indexOf('.from("trades")')),
    );
    expect(consulta).not.toContain(".not(");
  });
});
