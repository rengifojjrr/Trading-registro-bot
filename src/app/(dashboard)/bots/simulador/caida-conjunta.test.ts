import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Que la caída conjunta no vuelva a medirse sobre un trozo de la curva.
 *
 * Esto no comprueba el número --lo calcula Postgres y el número está
 * comprobado contra los datos reales en la migración
 * `20260917180000_la_caida_conjunta_sobre_toda_la_curva.sql`, con las dos
 * formas de sumarlo dando lo mismo hasta el céntimo--. Lo que comprueba es la
 * **forma** de pedirlo, que es donde estuvo el fallo.
 *
 * El fallo: la pantalla leía los puntos de curva con un tope de cinco mil
 * filas y sumaba las dieciocho curvas en memoria. El tope parecía una
 * precaución razonable contra una tabla que crece sola, y no lo era, porque
 * cortar por filas no acota el peso: acota el **periodo**, y lo acota cada vez
 * más según se añaden bots. Cinco mil filas resultaron ser las últimas
 * cuarenta y ocho horas de una historia de dos semanas, así que el tile decía
 * «caída máxima 0,8%» mientras el de al lado decía «P&L del conjunto -7,2%».
 * Dos cifras que no pueden ser ciertas a la vez: una curva que ha bajado desde
 * su máximo ha caído por lo menos lo que ha perdido. Sobre toda la historia
 * eran 14,26%.
 *
 * Lo que hace falta que siga siendo verdad es que la pantalla no vuelva a
 * traerse la curva para sacar un número de ella. Si alguien deshace esto, aquí
 * se entera.
 */

const PAGINA = readFileSync("src/app/(dashboard)/bots/simulador/page.tsx", "utf8");

describe("de dónde sale la caída máxima del simulador", () => {
  it("la calcula la base y no la pantalla", () => {
    expect(PAGINA).toContain('supabase.rpc("paper_caida_maxima_conjunta")');
  });

  it("no se trae los puntos de la curva", () => {
    // Traerlos es el primer paso de volver a sumarlos aquí, y son decenas de
    // miles de filas por visita a una página que además es `force-dynamic`.
    expect(PAGINA).not.toContain("paper_equity_points");
  });

  it("no queda un tope de filas rondando", () => {
    expect(PAGINA).not.toMatch(/MAX_PUNTOS|\.limit\(/);
  });

  it("dice de qué máximo a qué mínimo, para poder ir a mirarlo", () => {
    // Un porcentaje solo no se puede comprobar. Con las dos fechas se abre la
    // curva de esos días y se ve si fue una tarde o dos semanas.
    expect(PAGINA).toContain("caida.pico_ts");
    expect(PAGINA).toContain("caida.valle_ts");
  });
});
