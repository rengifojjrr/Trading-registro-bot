import { describe, expect, it } from "vitest";

import {
  atr,
  bollinger,
  computeIndicator,
  donchianAlto,
  donchianBajo,
  ema,
  ibs,
  INDICATORS,
  macd,
  maximoMovil,
  minimoMovil,
  rangoPrevio,
  rangoVerdadero,
  rsi,
  sma,
  supertrend,
  vwap,
  type IndicatorId,
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

describe("ventana móvil de máximos y mínimos", () => {
  it("no da nada hasta tener la ventana completa", () => {
    expect(maximoMovil([1, 5, 3, 2], 3)).toEqual([null, null, 5, 5]);
    expect(minimoMovil([1, 5, 3, 2], 3)).toEqual([null, null, 1, 2]);
  });

  it("la cola de candidatos da lo mismo que mirar la ventana entera", () => {
    // Es el único sitio donde la optimización puede mentir: si un candidato se
    // descarta antes de tiempo, el canal se queda con un extremo viejo y nadie
    // lo nota mirando el dibujo.
    const valores = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 100 + Math.cos(i / 3) * 40);
    const rapido = maximoMovil(valores, 9);
    for (let i = 8; i < valores.length; i += 1) {
      expect(rapido[i]!, `vela ${i}`).toBeCloseTo(Math.max(...valores.slice(i - 8, i + 1)), 9);
    }
  });
});

describe("canal de Donchian", () => {
  // Máximos que suben de uno en uno salvo un pico en la cuarta vela: con el
  // desplazamiento bien puesto el pico se ve desde la vela siguiente, no desde
  // la suya.
  const velas = [10, 11, 12, 20, 13, 14].map((alto, i) =>
    vela({ time: i, high: alto, low: alto - 5, close: alto - 1 }),
  );

  it("mira las velas anteriores, no la actual", () => {
    const canal = donchianAlto(velas, 3);
    expect(canal[3]).toBe(12); // máximo de 10, 11 y 12 -- el 20 de hoy no cuenta
    expect(canal[4]).toBe(20); // ahora sí, ya es pasado
  });

  it("por eso una ruptura puede pasar de verdad", () => {
    // Sin el desplazamiento, el máximo de la vela entra en su propio canal y
    // «rompe por encima» no ocurre jamás: la comparación es contra sí misma.
    // Es el fallo que no da error y que sólo se ve como «cero operaciones».
    const conDesplazamiento = donchianAlto(velas, 3);
    const sinDesplazamiento = maximoMovil(
      velas.map((v) => v.high),
      3,
    );

    expect(velas[3].high > conDesplazamiento[3]!).toBe(true);
    expect(velas[3].high > sinDesplazamiento[3]!).toBe(false);
  });

  it("el canal de abajo usa los mínimos y también va desplazado", () => {
    const bajos = [50, 40, 30, 10, 35].map((bajo, i) =>
      vela({ time: i, high: bajo + 5, low: bajo, close: bajo + 1 }),
    );
    const canal = donchianBajo(bajos, 3);
    expect(canal[3]).toBe(30); // mínimo de 50, 40 y 30
    expect(canal[4]).toBe(10);
    expect(bajos[3].low < canal[3]!).toBe(true);
  });

  it("las primeras velas no tienen canal", () => {
    // Con periodo 3 y desplazamiento 1 hacen falta cuatro velas.
    const canal = donchianAlto(velas, 3);
    expect(canal.slice(0, 3)).toEqual([null, null, null]);
  });
});

describe("SuperTrend", () => {
  // Cuarenta velas cayendo y luego treinta subiendo el triple de rápido: si el
  // indicador no cambia de lado aquí, no cambia nunca.
  const bajando = Array.from({ length: 40 }, (_, i) =>
    vela({ time: i, open: 100 - i, high: 101 - i, low: 99 - i, close: 100 - i }),
  );
  const subiendo = Array.from({ length: 30 }, (_, i) =>
    vela({
      time: 40 + i,
      open: 60 + i * 3,
      high: 61 + i * 3,
      low: 59 + i * 3,
      close: 60 + i * 3,
    }),
  );
  const velas = [...bajando, ...subiendo];
  const linea = supertrend(velas, 10, 1.5);

  it("va por encima del precio mientras cae", () => {
    expect(linea[30]!).toBeGreaterThan(velas[30].close);
  });

  it("y por debajo cuando la subida se confirma", () => {
    expect(linea.at(-1)!).toBeLessThan(velas.at(-1)!.close);
  });

  it("cambia de lado una sola vez en un giro limpio", () => {
    // Más de un cambio en un tramo así sería el indicador oscilando, que es lo
    // que la banda con trinquete existe para evitar.
    const lados = velas
      .map((v, i) => (linea[i] === null ? null : v.close > linea[i]!))
      .filter((l): l is boolean => l !== null);
    const cambios = lados.filter((l, i) => i > 0 && l !== lados[i - 1]).length;
    expect(cambios).toBe(1);
  });

  it("la banda no se afloja mientras dura el lado", () => {
    // El trinquete es lo que lo convierte en un stop que acompaña. Sin él la
    // línea se separaría del precio en cada vela ancha.
    for (let i = 12; i < 40; i += 1) {
      expect(linea[i]!, `vela ${i}`).toBeLessThanOrEqual(linea[i - 1]!);
    }
  });

  it("no dice nada antes de tener ATR", () => {
    expect(linea[9]).toBeNull();
    expect(linea[10]).not.toBeNull();
  });
});

describe("Bollinger", () => {
  it("sin dispersión las bandas son la media", () => {
    const planas = bollinger(new Array(30).fill(100), 20, 2);
    expect(planas.superior.at(-1)!).toBeCloseTo(100, 9);
    expect(planas.inferior.at(-1)!).toBeCloseTo(100, 9);
  });

  it("son la media más y menos las desviaciones pedidas", () => {
    // Media 5 y desviación 2 a mano, con la fórmula de población.
    const valores = [2, 4, 4, 4, 5, 5, 7, 9];
    const bandas = bollinger(valores, 8, 2);
    expect(bandas.media.at(-1)!).toBeCloseTo(5, 9);
    expect(bandas.superior.at(-1)!).toBeCloseTo(9, 9);
    expect(bandas.inferior.at(-1)!).toBeCloseTo(1, 9);
  });
});

describe("MACD", () => {
  const valores = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 5) * 10);
  const { linea, senal } = macd(valores);

  it("la línea arranca cuando arranca la exponencial lenta", () => {
    expect(linea[24]).toBeNull();
    expect(linea[25]).not.toBeNull();
  });

  it("la señal arranca nueve velas después, no antes", () => {
    // Si los huecos de la línea se le pasaran como ceros, la señal empezaría
    // en la vela 25 y hundida, cruzando la línea donde no cruza nada.
    expect(senal[32]).toBeNull();
    expect(senal[33]).not.toBeNull();
  });

  it("la primera señal está dentro del tramo que suaviza", () => {
    const tramo = linea.slice(25, 34).map((v) => v!);
    expect(senal[33]!).toBeGreaterThanOrEqual(Math.min(...tramo));
    expect(senal[33]!).toBeLessThanOrEqual(Math.max(...tramo));
  });
});

describe("IBS", () => {
  it("cerrar en el mínimo es cero", () => {
    expect(ibs([vela({ time: 1, high: 110, low: 100, close: 100 })])[0]).toBe(0);
  });

  it("cerrar en el máximo es uno", () => {
    expect(ibs([vela({ time: 1, high: 110, low: 100, close: 110 })])[0]).toBe(1);
  });

  it("por el medio es la fracción del rango", () => {
    expect(ibs([vela({ time: 1, high: 110, low: 100, close: 102.5 })])[0]).toBeCloseTo(0.25, 9);
  });

  it("una vela sin rango no tiene IBS", () => {
    // Contestar 0,5 sería inventar una lectura neutra donde no hay ninguna, y
    // esa media verdad acabaría dentro de una condición de reversión.
    expect(ibs([vela({ time: 1, high: 100, low: 100, close: 100 })])[0]).toBeNull();
  });
});

describe("rango previo", () => {
  it("es el de la vela anterior, no el de la actual", () => {
    // La vela en curso todavía está creciendo: medir una ruptura contra un
    // número que crece con ella da un resultado distinto según cuándo se mire.
    const velas = [
      vela({ time: 1, high: 110, low: 100 }),
      vela({ time: 2, high: 130, low: 120 }),
    ];
    expect(rangoPrevio(velas)).toEqual([null, 10]);
  });
});

describe("RSI 2", () => {
  it("es el mismo cálculo de Wilder con periodo dos", () => {
    // A mano: subidas medias 1,5 y bajadas 0 en la vela 2 -- cien por
    // definición. En la 3, (1,5+0)/2 contra (0+1)/2 da rs 3 y RSI 60.
    expect(rsi([100, 101, 103, 102], 2)).toEqual([null, null, 100, 60]);
  });

  it("arranca en la segunda vela y no antes", () => {
    const salida = rsi([100, 101, 103, 102, 104], 2);
    expect(salida[1]).toBeNull();
    expect(salida[2]).not.toBeNull();
  });

  it("llega al extremo mucho antes que el de catorce", () => {
    // Es su razón de ser: con dos velas basta una racha corta para marcar
    // sobreventa, y ahí es donde Connors compra.
    const valores = [...Array.from({ length: 30 }, (_, i) => 100 + i), 128, 126, 124];
    const corto = rsi(valores, 2).at(-1)!;
    const largo = rsi(valores, 14).at(-1)!;
    expect(corto).toBeLessThan(20);
    expect(largo).toBeGreaterThan(40);
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

describe("lo que el catálogo tiene que poder expresar", () => {
  const sesion = (t: number) => String(Math.floor(t / 86400));

  it("el máximo de siete sí cuenta la vela en curso", () => {
    // Al revés que el Donchian, y a propósito: el Double Seven pregunta si el
    // cierre de hoy es el más bajo de los últimos siete, y esa cuenta empieza
    // por hoy.
    const velas = [12, 11, 10, 9, 8, 7, 20].map((alto, i) =>
      vela({ time: i * 3600, high: alto, low: alto - 3, close: alto - 1 }),
    );
    expect(computeIndicator("ALTO_7", velas, sesion)[6]).toBe(20);
    expect(computeIndicator("BAJO_7", velas, sesion)[6]).toBe(4);
  });

  it("están los identificadores que usan las estrategias validadas", () => {
    // La lista literal, no `INDICATORS.length`: lo que rompe una estrategia
    // guardada es que desaparezca un identificador concreto, y un recuento no
    // se entera de un cambio de nombre.
    const imprescindibles: IndicatorId[] = [
      "EMA21",
      "EMA55",
      "SMA50",
      "SMA200",
      "DONCHIAN_ALTO_20",
      "DONCHIAN_BAJO_10",
      "DONCHIAN_ALTO_55",
      "DONCHIAN_BAJO_20",
      "SUPERTREND",
      "BB_SUPERIOR",
      "BB_INFERIOR",
      "ALTO_7",
      "BAJO_7",
      "RSI2",
      "MACD",
      "MACD_SENAL",
      "IBS",
      "RANGO_PREVIO",
    ];
    const declarados = new Set(INDICATORS.map((i) => i.id));
    for (const id of imprescindibles) expect(declarados.has(id), id).toBe(true);
  });
});
