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

/** Entra en cuanto puede y sale a las diez velas: sirve para tener operaciones. */
const SIEMPRE: Strategy = {
  ...EMPTY_STRATEGY,
  name: "Entra siempre, sale a las diez velas",
  direction: "LONG",
  entry: [
    { left: { kind: "PRECIO", field: "CLOSE" }, comparator: "MAYOR", right: { kind: "NUMERO", value: 0 } },
  ],
  exit: { stopAtr: null, targetAtr: null, maxBars: 10, conditions: [] },
};

describe("los porcentajes no dependen de la época del precio", () => {
  /**
   * El fallo que motivó todo esto.
   *
   * El porcentaje se sacaba dividiendo el P&L en dólares entre el cierre de la
   * **primera** vela. Sobre doce días de velas de cinco minutos da igual,
   * porque el precio casi no se mueve. Sobre diez años de velas diarias no: la
   * primera vela de ETH en esa ventana vale 10,84 dólares y el precio se mueve
   * 715 veces, así que unos dólares ganados en 2025 divididos entre 10,84
   * daban «+39.495%» y una caída máxima del «3.090%».
   *
   * Una caída del 3.090% es imposible: no se puede perder treinta veces el
   * máximo que se llegó a tener. Y era la clase de número que esta biblioteca
   * existe para no publicar.
   */
  const rampaLarga = velas(200, 10, 12); // de 10 a 2.398, como ETH desde 2016

  it("una caída máxima no puede pasar del 100%", () => {
    const medicion = medirSobreVelas({ reglas: SIEMPRE, mercado: "ETH-USD" }, rampaLarga)!;

    expect(medicion.trades).toBeGreaterThan(0);
    expect(medicion.ddPct).toBeLessThanOrEqual(100);
    expect(medicion.ddPct).toBeGreaterThanOrEqual(0);
  });

  it("ni el retorno ser el de otra escala de precios", () => {
    // Las mismas velas multiplicadas por cien: la misma forma, otra época. Lo
    // que gana la estrategia en porcentaje tiene que ser prácticamente lo
    // mismo; antes se multiplicaba por cien con ellas.
    const baratas = medirSobreVelas({ reglas: SIEMPRE, mercado: "ETH-USD" }, rampaLarga)!;
    const caras = medirSobreVelas(
      { reglas: SIEMPRE, mercado: "ETH-USD" },
      rampaLarga.map((v) => ({
        ...v,
        open: v.open * 100,
        high: v.high * 100,
        low: v.low * 100,
        close: v.close * 100,
      })),
    )!;

    expect(caras.trades).toBe(baratas.trades);
    // No idénticos: el deslizamiento del motor es un tick de un dólar, que
    // pesa cien veces más sobre el precio pequeño. Lo que importa es que la
    // diferencia sea ésa y no un factor de cien.
    expect(caras.pnlPct / baratas.pnlPct).toBeGreaterThan(0.5);
    expect(caras.pnlPct / baratas.pnlPct).toBeLessThan(2);
  });

  it("una estrategia que no entra se mide igual, con cero", () => {
    // «Se corrió sobre doscientas velas y no entró ni una vez» es un
    // resultado. No es lo mismo que «sin medir».
    const nunca = medirSobreVelas({ reglas: NUNCA, mercado: "BTC-USD" }, velas(200, 70_000, 10))!;
    expect(nunca.trades).toBe(0);
    expect(nunca.pnlPct).toBe(0);
    expect(nunca.ddPct).toBe(0);
  });
});
