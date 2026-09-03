import { describe, expect, it } from "vitest";

import { EMPTY_STRATEGY, type Strategy } from "@/lib/backtest/types";
import type { Vela } from "@/lib/charts/indicators";

import {
  aplicarDeslizamiento,
  barrasEnMercado,
  evaluarVela,
  resultadoDeOperacion,
  tamanoPorCapital,
  valorDeCierre,
  type AjustesPapel,
  type PosicionAbierta,
} from "./engine";

/**
 * Lo que se prueba aquí es lo que hace que la simulación no mienta: que el
 * stop salte dentro de la vela y no al cierre, que gane el stop cuando se
 * tocan los dos, que el deslizamiento vaya siempre en contra y que el cierre
 * por tiempo cuente las velas desde la de entrada.
 *
 * Todo con velas escritas a mano. Una serie generada «realista» esconde
 * exactamente el caso que se quiere probar: la vela que se hundió hasta el
 * stop y cerró arriba pasa desapercibida entre otras trescientas.
 */

const HORA_BASE = 1_700_000_000;
const UNA_HORA = 3600;

/** Una vela horaria con los precios que se le digan. */
function vela(i: number, precios: Partial<Omit<Vela, "time">> = {}): Vela {
  return {
    time: HORA_BASE + i * UNA_HORA,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
    ...precios,
  };
}

/** Una serie plana lo bastante larga para que el ATR14 ya tenga valor. */
function seriePlana(largo = 40): Vela[] {
  return Array.from({ length: largo }, (_, i) => vela(i));
}

const SIN_COSTES: AjustesPapel = { comisionPct: 0, deslizamientoPct: 0 };
const sesionDiaria = (t: number) => String(Math.floor(t / 86400));

/** Entra cuando el cierre pasa de 100. Sin indicadores: la señal es exacta. */
const entrarPorEncimaDe100: Strategy = {
  ...EMPTY_STRATEGY,
  name: "Por encima de 100",
  entry: [
    {
      left: { kind: "PRECIO", field: "CLOSE" },
      comparator: "MAYOR",
      right: { kind: "NUMERO", value: 100 },
    },
  ],
  exit: { stopAtr: null, targetAtr: null, maxBars: null, conditions: [] },
};

function posicionLarga(over: Partial<PosicionAbierta> = {}): PosicionAbierta {
  return {
    side: "LARGO",
    size: 1,
    precioEntrada: 100,
    horaEntrada: HORA_BASE,
    stop: 95,
    objetivo: 110,
    atrEntrada: 2,
    ...over,
  };
}

describe("el stop salta dentro de la vela", () => {
  it("cierra por stop aunque la vela cierre por encima del nivel", () => {
    // La vela se hundió hasta 94 y volvió a 100. Mirando sólo el cierre, esta
    // operación seguiría abierta -- y en el mercado real la orden ya se
    // ejecutó abajo. Es el caso que borra del histórico las peores
    // operaciones de la estrategia.
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 101, low: 94, close: 100 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 95, motivo: "STOP" });
  });

  it("no cierra si el mínimo de la vela no llegó al stop", () => {
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 101, low: 95.5, close: 96 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "NADA" });
  });

  it("en un corto mira el máximo, no el mínimo", () => {
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 106, low: 99, close: 100 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ side: "CORTO", stop: 105, objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 105, motivo: "STOP" });
  });

  it("si la vela abrió pasada del stop, se sale a la apertura y no al nivel", () => {
    // Un hueco de apertura: la orden no se pudo ejecutar en 95 porque a las
    // 95 no se negoció nada. Suponer el nivel sería regalarle a la estrategia
    // un precio que no existió.
    const velas = [...seriePlana(5), vela(5, { open: 90, high: 92, low: 88, close: 91 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 90, motivo: "STOP" });
  });
});

describe("cuando se tocan los dos, gana el stop", () => {
  it("una vela que barre el stop y el objetivo cierra por stop", () => {
    // Sin datos de tick no se puede saber cuál se tocó antes. Suponer que fue
    // el objetivo es lo que hace que un backtest salga mejor de lo que es.
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 115, low: 90, close: 105 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga(),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 95, motivo: "STOP" });
  });

  it("con el objetivo tocado y el stop intacto, sí cierra por objetivo", () => {
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 115, low: 99, close: 112 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga(),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 110, motivo: "OBJETIVO" });
  });

  it("también en corto: el stop de arriba manda sobre el objetivo de abajo", () => {
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 108, low: 88, close: 95 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ side: "CORTO", stop: 105, objetivo: 90 }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 105, motivo: "STOP" });
  });
});

describe("el deslizamiento va siempre en contra", () => {
  const ajustes: AjustesPapel = { comisionPct: 0, deslizamientoPct: 0.5 };

  it("abrir en largo sale más caro que el cierre de la vela", () => {
    const velas = [...seriePlana(5), vela(5, { close: 200, high: 201, low: 199, open: 200 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: null,
      ajustes,
      sessionOf: sesionDiaria,
    });

    expect(accion.tipo).toBe("ABRIR");
    if (accion.tipo !== "ABRIR") return;
    expect(accion.side).toBe("LARGO");
    expect(accion.precio).toBe(201); // 200 * 1,005
  });

  it("abrir en corto se ejecuta más barato que el cierre de la vela", () => {
    const velas = [...seriePlana(5), vela(5, { close: 200, high: 201, low: 199, open: 200 })];

    const accion = evaluarVela({
      velas,
      estrategia: { ...entrarPorEncimaDe100, direction: "SHORT" },
      posicion: null,
      ajustes,
      sessionOf: sesionDiaria,
    });

    expect(accion.tipo).toBe("ABRIR");
    if (accion.tipo !== "ABRIR") return;
    expect(accion.side).toBe("CORTO");
    expect(accion.precio).toBe(199); // 200 * 0,995
  });

  it("cerrar un largo vende por debajo del nivel del stop", () => {
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 101, low: 90, close: 100 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ stop: 96, objetivo: null }),
      ajustes,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 95.52, motivo: "STOP" }); // 96 * 0,995
  });

  it("cerrar un corto recompra por encima del nivel del stop", () => {
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 110, low: 99, close: 100 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ side: "CORTO", stop: 104, objetivo: null }),
      ajustes,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 104.52, motivo: "STOP" }); // 104 * 1,005
  });

  it("la función suelta también empeora las dos direcciones", () => {
    expect(aplicarDeslizamiento(100, "COMPRA", 0.02)).toBe(100.02);
    expect(aplicarDeslizamiento(100, "VENTA", 0.02)).toBe(99.98);
  });
});

describe("el cierre por tiempo", () => {
  it("cierra al cumplirse maxBars, al cierre de la vela", () => {
    const velas = seriePlana(10).map((v, i) =>
      i === 9 ? { ...v, close: 103, high: 104, low: 99 } : v,
    );

    const accion = evaluarVela({
      velas,
      estrategia: {
        ...entrarPorEncimaDe100,
        exit: { stopAtr: null, targetAtr: null, maxBars: 4, conditions: [] },
      },
      // Entró en la vela 5; la última es la 9, así que lleva 4 velas dentro.
      posicion: posicionLarga({ horaEntrada: HORA_BASE + 5 * UNA_HORA, stop: null, objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 103, motivo: "TIEMPO" });
  });

  it("aguanta una vela menos de las que dice maxBars", () => {
    const velas = seriePlana(10);

    const accion = evaluarVela({
      velas,
      estrategia: {
        ...entrarPorEncimaDe100,
        exit: { stopAtr: null, targetAtr: null, maxBars: 5, conditions: [] },
      },
      posicion: posicionLarga({ horaEntrada: HORA_BASE + 5 * UNA_HORA, stop: null, objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "NADA" });
  });

  it("el stop manda sobre el tiempo cuando los dos se cumplen en la misma vela", () => {
    const velas = seriePlana(10).map((v, i) => (i === 9 ? { ...v, low: 90 } : v));

    const accion = evaluarVela({
      velas,
      estrategia: {
        ...entrarPorEncimaDe100,
        exit: { stopAtr: null, targetAtr: null, maxBars: 4, conditions: [] },
      },
      posicion: posicionLarga({ horaEntrada: HORA_BASE + 5 * UNA_HORA, objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 95, motivo: "STOP" });
  });

  it("una posición más vieja que la ventana de velas se cierra igualmente por tiempo", () => {
    const velas = seriePlana(10);

    const accion = evaluarVela({
      velas,
      estrategia: {
        ...entrarPorEncimaDe100,
        exit: { stopAtr: null, targetAtr: null, maxBars: 5, conditions: [] },
      },
      posicion: posicionLarga({ horaEntrada: HORA_BASE - 500 * UNA_HORA, stop: null, objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 100, motivo: "TIEMPO" });
  });

  it("barrasEnMercado cuenta desde la vela de entrada", () => {
    const velas = seriePlana(10);
    expect(barrasEnMercado(velas, HORA_BASE + 9 * UNA_HORA)).toBe(0);
    expect(barrasEnMercado(velas, HORA_BASE + 5 * UNA_HORA)).toBe(4);
    expect(barrasEnMercado(velas, HORA_BASE)).toBe(9);
  });
});

describe("el cierre por condición", () => {
  it("cierra cuando se cumple alguna condición de salida", () => {
    const velas = [...seriePlana(5), vela(5, { open: 100, high: 101, low: 99, close: 98 })];

    const accion = evaluarVela({
      velas,
      estrategia: {
        ...entrarPorEncimaDe100,
        exit: {
          stopAtr: null,
          targetAtr: null,
          maxBars: null,
          conditions: [
            {
              left: { kind: "PRECIO", field: "CLOSE" },
              comparator: "MENOR",
              right: { kind: "NUMERO", value: 99 },
            },
          ],
        },
      },
      posicion: posicionLarga({ stop: null, objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "CERRAR", precio: 98, motivo: "CONDICION" });
  });
});

describe("la entrada", () => {
  it("no abre nada mientras haya una posición viva", () => {
    // Aquí no se piramida: una segunda entrada del mismo bot es un fallo, no
    // una decisión.
    const velas = [...seriePlana(5), vela(5, { close: 200, high: 201, low: 199, open: 200 })];

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: posicionLarga({ stop: null, objetivo: null }),
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "NADA" });
  });

  it("no abre si la condición no se cumple en la última vela", () => {
    const velas = seriePlana(10);

    const accion = evaluarVela({
      velas,
      estrategia: entrarPorEncimaDe100,
      posicion: null,
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion).toEqual({ tipo: "NADA" });
  });

  it("respeta el horario de la estrategia", () => {
    const velas = [...seriePlana(5), vela(5, { close: 200, high: 201, low: 199, open: 200 })];
    const horaDeLaVela = new Date(velas[velas.length - 1].time * 1000).getUTCHours();

    const fuera = evaluarVela({
      velas,
      estrategia: { ...entrarPorEncimaDe100, hours: [(horaDeLaVela + 1) % 24] },
      posicion: null,
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });
    expect(fuera).toEqual({ tipo: "NADA" });

    const dentro = evaluarVela({
      velas,
      estrategia: { ...entrarPorEncimaDe100, hours: [horaDeLaVela] },
      posicion: null,
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });
    expect(dentro.tipo).toBe("ABRIR");
  });

  it("coloca el stop y el objetivo en múltiplos del ATR", () => {
    // La serie plana tiene rango verdadero 2 en cada vela, así que el ATR14
    // vale 2 exactamente y los niveles se pueden comprobar a mano.
    const velas = [...seriePlana(30), vela(30, { open: 100, high: 101, low: 99, close: 100.5 })];

    const accion = evaluarVela({
      velas,
      estrategia: {
        ...entrarPorEncimaDe100,
        exit: { stopAtr: 2, targetAtr: 3, maxBars: null, conditions: [] },
      },
      posicion: null,
      ajustes: SIN_COSTES,
      sessionOf: sesionDiaria,
    });

    expect(accion.tipo).toBe("ABRIR");
    if (accion.tipo !== "ABRIR") return;
    expect(accion.atr).toBeCloseTo(2, 6);
    expect(accion.stop).toBeCloseTo(100.5 - 4, 6);
    expect(accion.objetivo).toBeCloseTo(100.5 + 6, 6);
  });

  it("sin velas suficientes no decide nada", () => {
    expect(
      evaluarVela({
        velas: [vela(0)],
        estrategia: entrarPorEncimaDe100,
        posicion: null,
        ajustes: SIN_COSTES,
        sessionOf: sesionDiaria,
      }),
    ).toEqual({ tipo: "NADA" });
  });
});

describe("las cuentas de una operación", () => {
  it("cobra la comisión en las dos puntas", () => {
    // 1000 de entrada y 1100 de salida, al 0,2%: 2 + 2,2 = 4,2 de comisión.
    const r = resultadoDeOperacion({
      side: "LARGO",
      size: 10,
      precioEntrada: 100,
      precioSalida: 110,
      comisionPct: 0.2,
    });

    expect(r.comision).toBe(4.2);
    expect(r.pnl).toBe(95.8);
    expect(r.pnlPct).toBe(9.58);
  });

  it("en corto gana cuando el precio baja", () => {
    const r = resultadoDeOperacion({
      side: "CORTO",
      size: 10,
      precioEntrada: 100,
      precioSalida: 90,
      comisionPct: 0,
    });

    expect(r.pnl).toBe(100);
    expect(r.pnlPct).toBe(10);
  });

  it("una operación que no se mueve pierde exactamente la comisión", () => {
    const r = resultadoDeOperacion({
      side: "LARGO",
      size: 1,
      precioEntrada: 50_000,
      precioSalida: 50_000,
      comisionPct: 0.2,
    });

    expect(r.pnl).toBe(-200);
    expect(r.comision).toBe(200);
  });

  it("el valor de cierre es el importe reservado más el resultado neto", () => {
    const posicion = posicionLarga({ size: 2, precioEntrada: 100, stop: null, objetivo: null });
    // 200 reservados, cierre a 110 con 0,2%: +20 de bruto y 0,84 de comisión
    // (0,40 al entrar sobre 200 y 0,44 al salir sobre 220).
    expect(valorDeCierre(posicion, 110, 0.2)).toBe(219.16);
  });

  it("el tamaño se trunca, nunca se redondea hacia arriba", () => {
    // 1000 / 30000 = 0,0333... Truncado, el importe cabe en el capital; con
    // redondeo hacia arriba se pasaría y la escritura chocaría contra el
    // check de efectivo no negativo.
    const size = tamanoPorCapital(1000, 30_000);
    expect(size).toBe(0.03333333);
    expect(size * 30_000).toBeLessThanOrEqual(1000);
  });

  it("sin capital o sin precio no hay tamaño que abrir", () => {
    expect(tamanoPorCapital(0, 100)).toBe(0);
    expect(tamanoPorCapital(100, 0)).toBe(0);
  });
});
