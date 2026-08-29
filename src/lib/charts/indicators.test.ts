import { describe, expect, it } from "vitest";

import {
  atr,
  computeIndicator,
  ema,
  INDICATORS,
  rangoVerdadero,
  rsi,
  sma,
  vwap,
  type Vela,
} from "./indicators";

const vela = (over: Partial<Vela> & { time: number }): Vela => ({
  open: 100,
  high: 100,
  low: 100,
  close: 100,
  volume: 1,
  ...over,
});

describe("media móvil simple", () => {
  it("no da nada hasta tener la ventana completa", () => {
    // Devolver la media de dos valores donde se pidió la de cinco sería una
    // media distinta pintada con el nombre de la que se pidió.
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("la suma corrediza da lo mismo que recalcular la ventana", () => {
    const valores = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 10);
    const rapida = sma(valores, 7);
    for (let i = 6; i < valores.length; i += 1) {
      const lento = valores.slice(i - 6, i + 1).reduce((s, v) => s + v, 0) / 7;
      expect(rapida[i]!).toBeCloseTo(lento, 9);
    }
  });

  it("un periodo imposible no revienta", () => {
    expect(sma([1, 2, 3], 0)).toEqual([null, null, null]);
  });
});

describe("media móvil exponencial", () => {
  it("arranca con la simple del primer periodo", () => {
    // Empezando por el primer valor suelto, las primeras decenas de velas
    // salen arrastradas hacia él y la media dibuja una curva que no existe.
    const valores = [10, 20, 30, 40, 50];
    expect(ema(valores, 3)![2]).toBeCloseTo(20, 9); // (10+20+30)/3
  });

  it("después aplica el factor de suavizado", () => {
    const salida = ema([10, 20, 30, 40], 3);
    // k = 2/(3+1) = 0,5. Siguiente = 40*0,5 + 20*0,5 = 30.
    expect(salida[3]!).toBeCloseTo(30, 9);
  });

  it("sin velas suficientes no inventa nada", () => {
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });

  it("reacciona antes que la simple a un salto de precio", () => {
    // Es su razón de ser: si no reaccionara antes, sobraría.
    //
    // Se mide **a mitad de la transición**, no al final. Diez velas después de
    // un salto la ventana de una simple de diez ya es toda nueva y las dos han
    // llegado; la diferencia sólo existe mientras la ventana está a medias, y
    // medirla fuera de ahí es medir otra cosa.
    const salto = [...Array(20).fill(100), ...Array(5).fill(120)];
    const rapida = ema(salto, 10).at(-1)!;
    const lenta = sma(salto, 10).at(-1)!;

    expect(rapida).toBeGreaterThan(lenta);
    // Y las dos van hacia el precio nuevo, sin pasarse.
    expect(rapida).toBeLessThanOrEqual(120);
    expect(lenta).toBeGreaterThan(100);
  });
});

describe("VWAP", () => {
  const dia = (t: number) => (t < 100 ? "d1" : "d2");

  it("pondera por volumen, no por número de velas", () => {
    const velas = [
      vela({ time: 1, high: 100, low: 100, close: 100, volume: 1 }),
      vela({ time: 2, high: 200, low: 200, close: 200, volume: 9 }),
    ];
    // (100*1 + 200*9) / 10 = 190, no 150.
    expect(vwap(velas, dia)[1]!).toBeCloseTo(190, 9);
  });

  it("se reinicia cada sesión", () => {
    // Un VWAP acumulado desde hace tres meses no es un nivel, es una
    // constante.
    const velas = [
      vela({ time: 1, high: 100, low: 100, close: 100, volume: 10 }),
      vela({ time: 200, high: 300, low: 300, close: 300, volume: 1 }),
    ];
    expect(vwap(velas, dia)[1]!).toBeCloseTo(300, 9);
  });

  it("usa el precio típico, no el cierre", () => {
    const velas = [vela({ time: 1, high: 120, low: 60, close: 90, volume: 1 })];
    // (120 + 60 + 90) / 3 = 90 -- coincide aquí a propósito para que el
    // siguiente caso distinga de verdad.
    expect(vwap(velas, dia)[0]!).toBeCloseTo(90, 9);

    const asimetrica = [vela({ time: 1, high: 150, low: 60, close: 90, volume: 1 })];
    expect(vwap(asimetrica, dia)[0]!).toBeCloseTo(100, 9);
  });

  it("sin volumen no inventa un nivel", () => {
    const velas = [vela({ time: 1, volume: 0 })];
    expect(vwap(velas, dia)[0]).toBeNull();
  });
});

describe("RSI", () => {
  it("todo subidas da cien", () => {
    const subiendo = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(subiendo, 14).at(-1)!).toBeCloseTo(100, 6);
  });

  it("todo bajadas da cero", () => {
    const bajando = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(bajando, 14).at(-1)!).toBeCloseTo(0, 6);
  });

  it("sube y baja lo mismo se queda por el medio", () => {
    const sierra = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 1));
    const ultimo = rsi(sierra, 14).at(-1)!;
    expect(ultimo).toBeGreaterThan(35);
    expect(ultimo).toBeLessThan(65);
  });

  it("el primer valor cae justo en la vela del periodo", () => {
    // Un desfase aquí dibuja el RSI corrido, y no se nota mirándolo.
    const valores = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5);
    const salida = rsi(valores, 14);
    expect(salida[13]).toBeNull();
    expect(salida[14]).not.toBeNull();
  });

  it("sin velas suficientes devuelve todo vacío", () => {
    expect(rsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });
});

describe("ATR", () => {
  it("el rango verdadero cuenta el hueco, no sólo la vela", () => {
    // Es toda la diferencia: máximo menos mínimo ignora los huecos, que es
    // justo cuando el ATR importa.
    const conHueco = vela({ time: 1, high: 110, low: 105, close: 108 });
    expect(rangoVerdadero(conHueco, 100)).toBe(10); // 110 - 100, no 110 - 105
  });

  it("sin hueco es el rango de la vela", () => {
    const normal = vela({ time: 1, high: 110, low: 100, close: 105 });
    expect(rangoVerdadero(normal, 105)).toBe(10);
  });

  it("un rango constante da ese rango", () => {
    const velas = Array.from({ length: 40 }, (_, i) =>
      vela({ time: i, high: 110, low: 100, close: 105, open: 105 }),
    );
    expect(atr(velas, 14).at(-1)!).toBeCloseTo(10, 6);
  });

  it("nunca es negativo", () => {
    const velas = Array.from({ length: 40 }, (_, i) =>
      vela({ time: i, high: 100 + (i % 7), low: 100 - (i % 5), close: 100 + (i % 3) }),
    );
    for (const v of atr(velas, 14)) {
      if (v !== null) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("el catálogo", () => {
  const velas = Array.from({ length: 250 }, (_, i) =>
    vela({
      time: i * 3600,
      open: 100 + Math.sin(i / 7) * 5,
      high: 104 + Math.sin(i / 7) * 5,
      low: 96 + Math.sin(i / 7) * 5,
      close: 100 + Math.sin(i / 6) * 5,
      volume: 10 + (i % 5),
    }),
  );
  const sesion = (t: number) => String(Math.floor(t / 86400));

  it("cada indicador declarado se sabe calcular", () => {
    // Uno que esté en la lista y no en el cálculo se ofrece, se elige y no
    // pinta nada -- y eso parece un fallo del gráfico, no una lista mal.
    for (const meta of INDICATORS) {
      const serie = computeIndicator(meta.id, velas, sesion);
      expect(serie, meta.id).toHaveLength(velas.length);
      expect(serie.some((v) => v !== null), `${meta.id} no da ningún valor`).toBe(true);
    }
  });

  it("ninguno devuelve un número que no es un número", () => {
    // Un NaN en el lienzo no da error: deja de pintar y no dice nada.
    for (const meta of INDICATORS) {
      for (const v of computeIndicator(meta.id, velas, sesion)) {
        if (v !== null) expect(Number.isFinite(v), meta.id).toBe(true);
      }
    }
  });

  it("todos declaran dónde se pintan y de qué color", () => {
    for (const meta of INDICATORS) {
      expect(["PRECIO", "PANEL"], meta.id).toContain(meta.pane);
      expect(meta.colorToken.startsWith("--"), meta.id).toBe(true);
      expect(meta.hint, meta.id).toBeTruthy();
    }
  });

  it("no repite identificadores", () => {
    expect(new Set(INDICATORS.map((i) => i.id)).size).toBe(INDICATORS.length);
  });
});
