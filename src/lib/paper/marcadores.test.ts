import { describe, expect, it } from "vitest";

import {
  alinearAVela,
  lineasDe,
  marcadoresDe,
  operacionesMarcables,
  posicionMarcable,
  type OperacionMarcable,
  type PosicionMarcable,
} from "./marcadores";

/**
 * Lo que se prueba aquí es lo que se equivoca sin que nadie lo note: que la
 * flecha caiga en la vela que estaba en pantalla y no entre dos, que un corto
 * no lleve las flechas de un largo, que la lista salga en el orden que exige
 * la librería aunque las filas lleguen al revés, y que una posición abierta
 * tenga entrada pero no salida.
 *
 * Los tiempos esperados se calculan con `Date.UTC` y no con un epoch escrito
 * a mano: un número de diez cifras copiado mal pasa cualquier revisión.
 */

const COLORES = { entrada: "color-entrada", salida: "color-salida" };
const QUINCE_MINUTOS = 900;
const UN_DIA = 86400;

/** Epoch en segundos de un instante UTC, para no tener que leer epochs a mano. */
function utc(mes: number, dia: number, hora: number, minuto: number, segundo = 0): number {
  return Date.UTC(2026, mes - 1, dia, hora, minuto, segundo) / 1000;
}

function operacion(over: Partial<OperacionMarcable> = {}): OperacionMarcable {
  return {
    side: "LARGO",
    horaEntrada: "2026-09-01T14:37:12.000Z",
    precioEntrada: "100",
    horaSalida: "2026-09-01T16:02:00.000Z",
    precioSalida: "105",
    motivoSalida: "OBJETIVO",
    ...over,
  };
}

function posicion(over: Partial<PosicionMarcable> = {}): PosicionMarcable {
  return {
    side: "LARGO",
    horaEntrada: "2026-09-02T09:05:00.000Z",
    precioEntrada: "100",
    stop: "95",
    objetivo: "110",
    ...over,
  };
}

describe("alinearAVela", () => {
  it("redondea hacia abajo a la apertura de la vela", () => {
    // Las 14:37:12 en un gráfico de quince minutos es la vela de las 14:30.
    expect(alinearAVela("2026-09-01T14:37:12.000Z", QUINCE_MINUTOS)).toBe(utc(9, 1, 14, 30));
  });

  it("en un gráfico diario cae en la medianoche UTC", () => {
    expect(alinearAVela("2026-09-01T14:37:12.000Z", UN_DIA)).toBe(utc(9, 1, 0, 0));
  });

  it("una hora que ya es apertura de vela se queda donde está", () => {
    // Es lo que escribe el simulador: la apertura de la vela que dio la señal.
    expect(alinearAVela("2026-09-01T14:30:00.000Z", QUINCE_MINUTOS)).toBe(utc(9, 1, 14, 30));
  });

  it("con una fecha que no se entiende devuelve null en vez de NaN", () => {
    expect(alinearAVela("ayer por la tarde", QUINCE_MINUTOS)).toBeNull();
  });

  it("con un tamaño de vela inválido deja el segundo exacto", () => {
    expect(alinearAVela("2026-09-01T14:37:12.000Z", 0)).toBe(utc(9, 1, 14, 37, 12));
  });
});

describe("marcadoresDe", () => {
  it("sin operaciones ni posición devuelve una lista vacía", () => {
    expect(marcadoresDe([], null, COLORES, QUINCE_MINUTOS)).toEqual([]);
  });

  it("alinea entrada y salida a la vela del gráfico", () => {
    const marcadores = marcadoresDe([operacion()], null, COLORES, QUINCE_MINUTOS);

    expect(marcadores.map((m) => m.time)).toEqual([utc(9, 1, 14, 30), utc(9, 1, 16, 0)]);
  });

  it("un largo entra con flecha arriba bajo la vela y sale con flecha abajo sobre ella", () => {
    const [entrada, salida] = marcadoresDe([operacion({ side: "LARGO" })], null, COLORES, QUINCE_MINUTOS);

    expect(entrada).toMatchObject({ position: "belowBar", shape: "arrowUp", color: COLORES.entrada });
    expect(salida).toMatchObject({ position: "aboveBar", shape: "arrowDown", color: COLORES.salida });
  });

  it("un corto es el espejo exacto del largo", () => {
    const [entrada, salida] = marcadoresDe([operacion({ side: "CORTO" })], null, COLORES, QUINCE_MINUTOS);

    expect(entrada).toMatchObject({ position: "aboveBar", shape: "arrowDown", color: COLORES.entrada });
    expect(salida).toMatchObject({ position: "belowBar", shape: "arrowUp", color: COLORES.salida });
  });

  it("ordena por tiempo ascendente aunque las filas lleguen de la más reciente a la más antigua", () => {
    // Así las devuelve `fetchPaperForBot`: ordenadas por hora de salida
    // descendente, porque la tabla enseña primero lo último.
    const reciente = operacion({
      horaEntrada: "2026-09-03T10:00:00.000Z",
      horaSalida: "2026-09-03T12:00:00.000Z",
    });
    const antigua = operacion({
      horaEntrada: "2026-09-01T10:00:00.000Z",
      horaSalida: "2026-09-01T12:00:00.000Z",
    });

    const tiempos = marcadoresDe([reciente, antigua], null, COLORES, QUINCE_MINUTOS).map((m) =>
      Number(m.time),
    );

    expect(tiempos).toEqual([...tiempos].sort((a, b) => a - b));
    expect(tiempos).toHaveLength(4);
  });

  it("una operación todavía sin salida sólo lleva la flecha de entrada", () => {
    const marcadores = marcadoresDe(
      [operacion({ horaSalida: null, precioSalida: null })],
      null,
      COLORES,
      QUINCE_MINUTOS,
    );

    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]).toMatchObject({ color: COLORES.entrada, shape: "arrowUp" });
  });

  it("la posición abierta lleva su entrada, con la flecha de su lado, y nada más", () => {
    const marcadores = marcadoresDe([], posicion({ side: "CORTO" }), COLORES, QUINCE_MINUTOS);

    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]).toMatchObject({
      time: utc(9, 2, 9, 0),
      position: "aboveBar",
      shape: "arrowDown",
      color: COLORES.entrada,
    });
  });

  it("dos marcadores en la misma vela se dejan los dos, la entrada antes que la salida", () => {
    // Abierta y cerrada dentro del mismo cuarto de hora: la librería apila
    // las flechas y aquí no hay que quitar ninguna.
    const marcadores = marcadoresDe(
      [operacion({ horaEntrada: "2026-09-01T14:31:00.000Z", horaSalida: "2026-09-01T14:44:00.000Z" })],
      null,
      COLORES,
      QUINCE_MINUTOS,
    );

    expect(marcadores).toHaveLength(2);
    expect(marcadores[0]).toMatchObject({ time: utc(9, 1, 14, 30), color: COLORES.entrada });
    expect(marcadores[1]).toMatchObject({ time: utc(9, 1, 14, 30), color: COLORES.salida });
  });

  it("una fecha que no se entiende pierde su flecha, no el gráfico entero", () => {
    const marcadores = marcadoresDe(
      [operacion({ horaEntrada: "sin fecha" })],
      null,
      COLORES,
      QUINCE_MINUTOS,
    );

    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]).toMatchObject({ color: COLORES.salida });
    expect(marcadores.every((m) => Number.isFinite(Number(m.time)))).toBe(true);
  });
});

describe("operacionesMarcables y posicionMarcable", () => {
  it("estrecha el lado de las filas y descarta las que traen otra cosa", () => {
    // Como llegan de `fetchPaperForBot`: con campos de sobra y el lado en texto.
    const filas = [
      { ...operacion(), side: "CORTO", id: "a", pnl: "3" },
      { ...operacion(), side: "AMBOS", id: "b", pnl: "0" },
      { ...operacion(), side: "LARGO", id: "c", pnl: "-1" },
    ];

    const marcables = operacionesMarcables(filas);

    expect(marcables.map((o) => o.side)).toEqual(["CORTO", "LARGO"]);
    // Sólo lo que el gráfico necesita: los campos de la fila se quedan fuera.
    expect(Object.keys(marcables[0]).sort()).toEqual(
      ["horaEntrada", "horaSalida", "motivoSalida", "precioEntrada", "precioSalida", "side"].sort(),
    );
  });

  it("una posición con lado desconocido es como no tener posición", () => {
    expect(posicionMarcable(null)).toBeNull();
    expect(posicionMarcable({ ...posicion(), side: "LONG" })).toBeNull();
  });

  it("una fila de paper_positions con campos de sobra se convierte tal cual", () => {
    // En una constante y no en línea: así la fila puede traer `id` y demás,
    // como la de verdad, sin que TypeScript proteste por propiedades de más.
    const fila = { ...posicion(), side: "CORTO", id: "x", atrEntrada: "2" };

    expect(posicionMarcable(fila)).toEqual(posicion({ side: "CORTO" }));
  });
});

describe("lineasDe", () => {
  it("sin posición abierta no hay líneas", () => {
    expect(lineasDe(null)).toEqual([]);
  });

  it("entrada, stop y objetivo, con los numeric de Postgres ya convertidos", () => {
    expect(lineasDe(posicion())).toEqual([
      { precio: 100, titulo: "Entrada", tipo: "ENTRADA" },
      { precio: 95, titulo: "Stop", tipo: "STOP" },
      { precio: 110, titulo: "Objetivo", tipo: "OBJETIVO" },
    ]);
  });

  it("un nivel que la estrategia no tiene no produce una línea en cero", () => {
    const lineas = lineasDe(posicion({ stop: null, objetivo: null }));

    expect(lineas.map((l) => l.tipo)).toEqual(["ENTRADA"]);
  });

  it("acepta números además de texto", () => {
    const lineas = lineasDe(posicion({ precioEntrada: 64120.5, stop: 61000, objetivo: null }));

    expect(lineas.map((l) => l.precio)).toEqual([64120.5, 61000]);
  });
});
