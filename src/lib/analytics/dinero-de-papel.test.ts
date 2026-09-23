import { describe, expect, it } from "vitest";

import { applyFilters, type TradeFilters } from "./queries";
import { parseTradeFilters } from "./filter-params";

/**
 * Que el dinero ficticio no se sume al de verdad.
 *
 * Va a haber las dos cosas en la misma tabla: paper trading de una cuenta demo
 * sincronizada por el mismo camino que Coinbase. Las dos son operaciones
 * ciertas y sólo una es dinero cierto, y sumarlas en un «P&L neto» sería
 * inventarse la cifra más importante de la aplicación.
 *
 * Lo que se vigila aquí no es que el filtro exista, es **de qué lado cae
 * cuando nadie lo pide**. Cuarenta y tantas consultas comparten
 * `applyFilters`; ninguna de ellas sabe que el papel existe, y ninguna tuvo
 * que enterarse. Eso sólo se sostiene mientras la omisión signifique «el
 * real».
 */

/** Anota los `.eq` / `.is` que le encadenan, que es todo lo que hace applyFilters. */
function consultaFalsa() {
  const llamadas: [string, unknown][] = [];
  const q = {
    eq(columna: string, valor: unknown) {
      llamadas.push([columna, valor]);
      return q;
    },
    is(columna: string, valor: unknown) {
      llamadas.push([columna, valor]);
      return q;
    },
    gte: () => q,
    lte: () => q,
  };
  return { q, llamadas };
}

function filtroDePapelDe(filters: TradeFilters): unknown {
  const { q, llamadas } = consultaFalsa();
  applyFilters(q, filters);
  const encontrado = llamadas.find(([columna]) => columna === "is_paper");
  return encontrado === undefined ? "NO_FILTRA" : encontrado[1];
}

describe("de qué lado cae cuando nadie lo pide", () => {
  it("sin decir nada, sólo el dinero de verdad", () => {
    // Éste es el test que importa. Si algún día pasa a «NO_FILTRA», el panel
    // suma dinero ficticio al real y nada más en la aplicación lo va a notar.
    expect(filtroDePapelDe({})).toBe(false);
  });

  it("pedir el real explícitamente es lo mismo que no decir nada", () => {
    expect(filtroDePapelDe({ dinero: "REAL" })).toBe(false);
  });

  it("los filtros que ya existían no lo cambian", () => {
    // Una vista filtrada por producto sigue siendo una vista de dinero real.
    expect(filtroDePapelDe({ productId: "BTC-USD", direction: "LONG" })).toBe(false);
  });
});

describe("cuando sí se pide", () => {
  it("sólo el de papel", () => {
    expect(filtroDePapelDe({ dinero: "PAPEL" })).toBe(true);
  });

  it("los dos no filtra nada, que es lo que quiere decir", () => {
    expect(filtroDePapelDe({ dinero: "TODO" })).toBe("NO_FILTRA");
  });
});

describe("lo que llega por la URL", () => {
  const zona = "UTC";

  it("una URL limpia pide el real", () => {
    expect(parseTradeFilters({}, zona).dinero).toBeUndefined();
    expect(filtroDePapelDe(parseTradeFilters({}, zona))).toBe(false);
  });

  it("los tres valores buenos pasan", () => {
    expect(parseTradeFilters({ dinero: "REAL" }, zona).dinero).toBe("REAL");
    expect(parseTradeFilters({ dinero: "PAPEL" }, zona).dinero).toBe("PAPEL");
    expect(parseTradeFilters({ dinero: "TODO" }, zona).dinero).toBe("TODO");
  });

  /**
   * El resto de filtros de este archivo se cuelan con un `as` y se puede:
   * un valor raro devuelve cero filas y se ve. Éste no, porque decide qué
   * dinero se suma, y una cadena inesperada que cayera del lado ancho sumaría
   * ficticio y real en la misma cifra sin que nada lo delate.
   */
  it("cualquier otra cosa cae del lado seguro", () => {
    for (const basura of ["todo", "TODOS", "papel", "", "1", "true", "PAPEL;--"]) {
      expect(parseTradeFilters({ dinero: basura }, zona).dinero, basura).toBeUndefined();
      expect(filtroDePapelDe(parseTradeFilters({ dinero: basura }, zona)), basura).toBe(false);
    }
  });

  it("y un array en el parámetro tampoco lo abre", () => {
    // Next entrega un array cuando el parámetro viene repetido: `?dinero=REAL&dinero=TODO`.
    expect(parseTradeFilters({ dinero: ["REAL", "TODO"] }, zona).dinero).toBeUndefined();
  });
});
