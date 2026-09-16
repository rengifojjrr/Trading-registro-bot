import { describe, expect, it } from "vitest";

import {
  centroDe,
  claveDeVista,
  encuadreInicial,
  HORAS_ANTES,
  HORAS_DESPUES,
  peticionDeVelas,
  rutaDeDibujos,
  topesDeVelas,
  tramoDelBorde,
  VELAS_ANTES,
  VELAS_DESPUES,
  VELAS_PEDIDAS_ANTES,
  VELAS_PEDIDAS_DESPUES,
  type FuenteDelGrafico,
} from "./fuente";

const OPERACION: FuenteDelGrafico = {
  tipo: "operacion",
  id: "11111111-1111-4111-8111-111111111111",
  desde: 1_700_000_000,
  hasta: 1_700_003_600,
};

const T0 = 1_700_000_000;
const EVENTO: FuenteDelGrafico = {
  tipo: "evento",
  id: "22222222-2222-4222-8222-222222222222",
  t0: T0,
};

describe("de quién es el gráfico", () => {
  it("cada dueño tiene su ruta de dibujos", () => {
    expect(rutaDeDibujos(OPERACION)).toBe(`/api/trades/${OPERACION.id}/drawings`);
    expect(rutaDeDibujos(EVENTO)).toBe(`/api/noticias/${EVENTO.id}/drawings`);
  });

  it("y la del dibujo concreto cuelga de ella", () => {
    expect(rutaDeDibujos(EVENTO, "abc")).toBe(`/api/noticias/${EVENTO.id}/drawings/abc`);
  });

  it("la vista se guarda con el tipo delante, para no compartir espacio de nombres", () => {
    const mismoId: FuenteDelGrafico = { tipo: "evento", id: OPERACION.id, t0: T0 };
    expect(claveDeVista(OPERACION)).not.toBe(claveDeVista(mismoId));
  });

  it("el centro de una publicación es la publicación", () => {
    expect(centroDe(EVENTO)).toBe(T0);
    expect(centroDe(OPERACION)).toBe(OPERACION.desde);
  });
});

describe("hasta dónde se traen velas", () => {
  it("una operación tiene ventana fija: no hay bordes que perseguir", () => {
    expect(topesDeVelas(OPERACION, Date.now() / 1000)).toBeNull();
  });

  it("una publicación se carga hacia los dos lados, con tope", () => {
    const topes = topesDeVelas(EVENTO, T0 + 10 * 24 * 3600);
    expect(topes).toEqual({
      suelo: T0 - HORAS_ANTES * 3600,
      techo: T0 + HORAS_DESPUES * 3600,
    });
  });

  it("y nunca más allá de ahora mismo, que devolvería listas vacías para siempre", () => {
    const ahora = T0 + 3600;
    expect(topesDeVelas(EVENTO, ahora)?.techo).toBe(ahora);
  });
});

describe("a qué URL se le piden", () => {
  it("la de una operación va por la operación, que es la que sabe su ventana", () => {
    const url = peticionDeVelas(OPERACION, "BTC-USD", "ONE_HOUR", 3600);
    expect(url.startsWith("/api/coinbase/trade-candles?")).toBe(true);
    expect(url).toContain(`tradeId=${OPERACION.id}`);
    expect(url).toContain("granularity=ONE_HOUR");
    // La ventana no viaja: la deriva la ruta de las marcas de la operación.
    expect(url).not.toContain("start=");
  });

  it("la de una publicación lleva el tramo, porque no hay nada que lo derive", () => {
    const url = peticionDeVelas(EVENTO, "BTC-USD", "FIVE_MINUTE", 300, {
      desde: T0 - 600,
      hasta: T0 + 600,
    });
    expect(url.startsWith("/api/economic-calendar/candles?")).toBe(true);
    expect(url).toContain(`start=${T0 - 600}`);
    expect(url).toContain(`end=${T0 + 600}`);
    expect(url).toContain("productId=BTC-USD");
  });

  it("sin tramo, pide trescientas velas alrededor del dato y no las setenta y dos horas", () => {
    // La ruta recorta cada petición a trescientas velas contando desde el
    // principio: pedir la ventana entera en velas de un minuto devolvería las
    // cinco horas anteriores al dato y ni una vela de la reacción.
    const url = peticionDeVelas(EVENTO, "BTC-USD", "ONE_MINUTE", 60);
    expect(url).toContain(`start=${T0 - VELAS_PEDIDAS_ANTES * 60}`);
    expect(url).toContain(`end=${T0 + VELAS_PEDIDAS_DESPUES * 60}`);
  });

  it("y la proporción se conserva al cambiar de tamaño de vela", () => {
    const url = peticionDeVelas(EVENTO, "BTC-USD", "ONE_HOUR", 3600);
    expect(url).toContain(`start=${T0 - VELAS_PEDIDAS_ANTES * 3600}`);
    expect(url).toContain(`end=${T0 + VELAS_PEDIDAS_DESPUES * 3600}`);
  });
});

describe("el encuadre de apertura", () => {
  const segundos = 300;
  const tiempos = Array.from({ length: 200 }, (_, i) => T0 - 100 * segundos + i * segundos);

  it("cuenta velas y no minutos, para que se vea igual en un minuto que en una hora", () => {
    expect(encuadreInicial(T0, segundos, tiempos)).toEqual({
      from: T0 - VELAS_ANTES * segundos,
      to: T0 + VELAS_DESPUES * segundos,
    });
  });

  it("se recorta a lo que hay: pedir hueco es lo que lanzaba al cargador nada más abrir", () => {
    const pocas = [T0 - segundos, T0, T0 + segundos];
    expect(encuadreInicial(T0, segundos, pocas)).toEqual({
      from: T0 - segundos,
      to: T0 + 2 * segundos,
    });
  });

  it("sin velas se queda en el dato, en vez de dar NaN", () => {
    expect(encuadreInicial(T0, segundos, [])).toEqual({ from: T0, to: T0 + segundos });
  });
});

describe("el tramo que se pide al llegar a un borde", () => {
  const segundos = 300;
  const topes = { suelo: T0 - HORAS_ANTES * 3600, techo: T0 + HORAS_DESPUES * 3600 };

  it("hacia atrás, trescientas velas como mucho", () => {
    // Con velas de un minuto, trescientas caben de sobra dentro del suelo.
    const tiempos = [T0, T0 + 60];
    expect(tramoDelBorde("izquierda", tiempos, 60, topes)).toEqual({
      desde: T0 - 300 * 60,
      hasta: T0 - 60,
    });
  });

  it("y sin pasarse del suelo, aunque quepan menos de trescientas", () => {
    // Trescientas velas de cinco minutos son veinticinco horas: más de lo que
    // el suelo permite, así que el tramo se recorta en vez de pedir de más.
    expect(tramoDelBorde("izquierda", [T0], segundos, topes)).toEqual({
      desde: topes.suelo,
      hasta: T0 - segundos,
    });
  });

  it("hacia delante, sin pasarse del techo", () => {
    const ultima = topes.techo - segundos;
    expect(tramoDelBorde("derecha", [ultima], segundos, topes)).toEqual({
      desde: ultima + segundos,
      hasta: topes.techo,
    });
  });

  it("en el tope no hay nada que traer, y ahí es donde se corta el bucle", () => {
    // Éste es el fallo entero: mientras devuelva un tramo, alejar el zoom deja
    // hueco, el hueco trae velas, y el gráfico se corre solo hacia la derecha.
    expect(tramoDelBorde("derecha", [topes.techo], segundos, topes)).toBeNull();
    expect(tramoDelBorde("izquierda", [topes.suelo], segundos, topes)).toBeNull();
  });

  it("sin velas todavía no se pide nada", () => {
    expect(tramoDelBorde("derecha", [], segundos, topes)).toBeNull();
  });
});
