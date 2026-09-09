import { describe, expect, it } from "vitest";

import {
  describeSurprise,
  formatCountdown,
  formatEventValue,
  surpriseOf,
} from "./format";

describe("formatEventValue", () => {
  it("pega la escala y la unidad al número", () => {
    expect(formatEventValue(205, null, "K")).toBe("205K");
    expect(formatEventValue(0.4, "%", null)).toBe("0,4%");
    expect(formatEventValue(-1.7, "%", null)).toBe("-1,7%");
    expect(formatEventValue(3.99, null, "M")).toBe("3,99M");
  });

  it("sin dato es un guion, nunca un cero", () => {
    // La distinción entera de esta función: un dato que aún no salió no es
    // un dato que salió y dio cero.
    expect(formatEventValue(null, "%", null)).toBe("—");
    expect(formatEventValue(0, "%", null)).toBe("0%");
  });

  it("no obliga a dos decimales ni inventa precisión", () => {
    expect(formatEventValue(2.5, "%", null)).toBe("2,5%");
    expect(formatEventValue(2, "%", null)).toBe("2%");
  });
});

describe("surpriseOf", () => {
  it("mide la desviación del dato contra la previsión", () => {
    expect(surpriseOf(0.4, 0.3)).toEqual({ direction: "ARRIBA", diff: expect.closeTo(0.1, 10) });
    expect(surpriseOf(0.1, 0.3)).toEqual({ direction: "ABAJO", diff: expect.closeTo(-0.2, 10) });
    expect(surpriseOf(0.3, 0.3)).toEqual({ direction: "EN_LINEA", diff: 0 });
  });

  it("sin previsión no hay sorpresa que medir", () => {
    expect(surpriseOf(0.4, null)).toBeNull();
    expect(surpriseOf(null, 0.3)).toBeNull();
    expect(surpriseOf(null, null)).toBeNull();
  });

  it("un dato real de cero sigue siendo un dato", () => {
    // El caso que rompe una comprobación escrita con `if (!actual)`.
    expect(surpriseOf(0, 0.2)).toEqual({ direction: "ABAJO", diff: -0.2 });
  });
});

describe("describeSurprise", () => {
  it("dice el sentido y los dos números", () => {
    const s = surpriseOf(0.4, 0.3)!;
    expect(describeSurprise(s, 0.4, 0.3, "%", null)).toBe(
      "salió por encima de lo previsto (0,4% frente a 0,3%)",
    );
  });

  it("en línea no repite el número dos veces", () => {
    const s = surpriseOf(0.3, 0.3)!;
    expect(describeSurprise(s, 0.3, 0.3, "%", null)).toBe("salió en línea con lo previsto (0,3%)");
  });
});

describe("formatCountdown", () => {
  const min = 60_000;
  const hora = 60 * min;

  it("redondea hacia abajo, que es como se cuenta el tiempo que falta", () => {
    expect(formatCountdown(119 * min)).toBe("1 h 59 min");
    expect(formatCountdown(45 * min)).toBe("45 min");
    expect(formatCountdown(30_000)).toBe("menos de 1 min");
  });

  it("en horas redondas no arrastra los minutos", () => {
    expect(formatCountdown(2 * hora)).toBe("2 h");
    expect(formatCountdown(24 * hora)).toBe("1 día");
  });

  it("los días llevan las horas sueltas", () => {
    expect(formatCountdown(26 * hora)).toBe("1 día 2 h");
    expect(formatCountdown(50 * hora)).toBe("2 días 2 h");
  });

  it("lo ya pasado no se cuenta aquí", () => {
    expect(formatCountdown(0)).toBeNull();
    expect(formatCountdown(-1000)).toBeNull();
  });
});
