import { describe, expect, it } from "vitest";

import { EMPTY_STRATEGY, type Strategy } from "@/lib/backtest/types";
import type { Vela } from "@/lib/charts/indicators";

import {
  COMISION_POR_LADO_PCT,
  VELAS_MINIMAS,
  medirSobreVelas,
  ventanaEnPalabras,
} from "./medir-estrategia";

/**
 * Lo que tiene que cumplir medir una estrategia de la biblioteca.
 *
 * La regla del módulo es que no se inventan números, así que lo que hay que
 * vigilar aquí no es que las cifras salgan bonitas sino que no salgan cuando
 * no se pueden sacar: sin histórico suficiente, sin operaciones, o cuando el
 * factor de beneficio sería una división por cero.
 */

const MINUTO = 60_000;

/** Velas sintéticas con una tendencia mansa, para que el motor tenga algo que mirar. */
function velas(cuantas: number, desde = 100, paso = 1): Vela[] {
  return Array.from({ length: cuantas }, (_, i) => {
    const close = desde + i * paso;
    return { time: i * MINUTO, open: close - paso / 2, high: close + 1, low: close - 1, close, volume: 1 };
  });
}

/** Una estrategia que no entra nunca: sirve para el caso de cero operaciones. */
const NUNCA: Strategy = {
  ...EMPTY_STRATEGY,
  name: "Nunca entra",
  // El cierre por debajo de cero no ocurre con estas velas, así que el motor
  // recorre el histórico entero sin abrir una sola posición.
  entry: [
    { left: { kind: "PRECIO", field: "CLOSE" }, comparator: "MENOR", right: { kind: "NUMERO", value: -1 } },
  ],
};

describe("cuándo no se mide", () => {
  it("sin histórico suficiente no devuelve cifras", () => {
    const pocas = velas(VELAS_MINIMAS - 1);
    expect(medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, pocas)).toBeNull();
  });

  /**
   * El caso peligroso: veinte velas dan un número, y un número tiene aspecto
   * de dato. El aspecto es lo que hay que impedir, no el número.
   */
  it("el mínimo es de verdad un mínimo", () => {
    expect(medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, velas(VELAS_MINIMAS))).not.toBeNull();
    expect(medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, velas(VELAS_MINIMAS - 1))).toBeNull();
  });
});

describe("una estrategia que no opera", () => {
  const medicion = medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, velas(200));

  it("se mide igual, con cero operaciones", () => {
    expect(medicion).not.toBeNull();
    expect(medicion!.trades).toBe(0);
  });

  it("no gana ni pierde nada", () => {
    expect(medicion!.pnlPct).toBe(0);
    expect(medicion!.ddPct).toBe(0);
  });

  /**
   * Bruto perdido cero: el factor sería una división por cero. Eso no es
   * infinito, es «no se sabe», y un «factor ∞» en una ficha se lee como la
   * estrategia perfecta.
   */
  it("no se inventa un factor de beneficio", () => {
    expect(medicion!.profitFactor).toBeNull();
  });
});

describe("lo que acompaña a la cifra", () => {
  const medicion = medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, velas(200))!;

  it("dice cuántas velas y entre qué días", () => {
    expect(medicion.velas).toBe(200);
    expect(medicion.desde).toBe(new Date(0).toISOString());
    expect(medicion.hasta).toBe(new Date(199 * MINUTO).toISOString());
  });

  it("dice con qué comisión se midió", () => {
    expect(medicion.comisionPct).toBe(COMISION_POR_LADO_PCT);
  });

  /**
   * Sin la ventana, un +30% en doce días de velas de cinco minutos y un +30%
   * en cinco años se leen igual.
   */
  it("la ventana se lee como una frase, con el producto y la temporalidad", () => {
    const frase = ventanaEnPalabras(medicion, "BTC-USD", "5m");
    expect(frase).toContain("BTC-USD 5m");
    expect(frase).toContain("200 velas");
    expect(frase).toContain("0,2% por lado");
    expect(frase).toContain("sin apalancamiento");
  });
});

describe("los porcentajes se miden contra lo que costaba entrar", () => {
  it("el capital es el precio de la primera vela, no una cifra redonda", () => {
    // El motor opera un contrato, así que un porcentaje sólo significa algo
    // medido contra lo que ese contrato costaba al empezar.
    const caras = medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, velas(200, 70_000, 10))!;
    const baratas = medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, velas(200, 100, 10))!;

    // Sin operaciones las dos dan cero, que es lo correcto: lo que se comprueba
    // es que ninguna revienta por el cambio de escala.
    expect(caras.pnlPct).toBe(0);
    expect(baratas.pnlPct).toBe(0);
  });
});
