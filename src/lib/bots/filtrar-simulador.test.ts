import { describe, expect, it } from "vitest";

import { FILTROS_VACIOS, type FiltrosDeBots } from "@/components/bots/simulador-filtros";

import { familiasPresentes, filtrarBots, type BotFiltrable } from "./filtrar-simulador";

/**
 * Lo que tiene que cumplir el filtrado de la tabla del simulador.
 *
 * Con dieciocho bots, la tabla ya no se lee: se le pregunta. «Cuál está
 * perdiendo», «cuál tiene una posición abierta», «cómo va el scalping». Cada
 * una de esas preguntas tiene una respuesta correcta y varias que se le
 * parecen -- la peor, meter en «perdiendo» a los que todavía no han operado.
 */

function bot(extra: Partial<BotFiltrable> = {}): BotFiltrable {
  return {
    nombre: "Cruce de EMA 9/21",
    familia: "SCALPING",
    mercado: "ETH-USD",
    temporalidad: "5m",
    equity: 10_000,
    pnl: 0,
    encendido: true,
    operaciones: 0,
    tienePosicion: false,
    ...extra,
  };
}

const FILTROS = (extra: Partial<FiltrosDeBots> = {}): FiltrosDeBots => ({
  ...FILTROS_VACIOS,
  ...extra,
});

describe("buscar por texto", () => {
  it("encuentra por nombre sin importar mayúsculas ni acentos", () => {
    const bots = [bot({ nombre: "Intradía con filtro" }), bot({ nombre: "Otro" })];
    expect(filtrarBots(bots, FILTROS({ texto: "INTRADIA" }))).toHaveLength(1);
  });

  it("busca también en el mercado y la temporalidad", () => {
    // «los de cinco minutos» y «los de ETH» es como se busca de verdad.
    const bots = [bot({ mercado: "ETH-USD" }), bot({ nombre: "X", mercado: "BTC-USD" })];
    expect(filtrarBots(bots, FILTROS({ texto: "eth" }))).toHaveLength(1);
    expect(filtrarBots(bots, FILTROS({ texto: "5m" }))).toHaveLength(2);
  });

  it("el texto en blanco no filtra nada", () => {
    const bots = [bot(), bot({ nombre: "Otro" })];
    expect(filtrarBots(bots, FILTROS({ texto: "   " }))).toHaveLength(2);
  });
});

describe("cómo va", () => {
  const bots = [
    bot({ nombre: "Gana", pnl: 500 }),
    bot({ nombre: "Pierde", pnl: -500 }),
    bot({ nombre: "Sin operar", pnl: 0, operaciones: 0 }),
    bot({ nombre: "Sin cuenta", pnl: null }),
  ];

  it("«ganando» es estrictamente por encima de cero", () => {
    expect(filtrarBots(bots, FILTROS({ resultado: "GANANDO" })).map((b) => b.nombre)).toEqual([
      "Gana",
    ]);
  });

  /**
   * El error fácil: contar como perdedor al que está en cero. Un bot que no ha
   * operado no está perdiendo, está esperando, y mezclarlos hace que el filtro
   * conteste una pregunta distinta de la que se le hizo.
   */
  it("«perdiendo» no incluye al que todavía no ha operado", () => {
    expect(filtrarBots(bots, FILTROS({ resultado: "PERDIENDO" })).map((b) => b.nombre)).toEqual([
      "Pierde",
    ]);
  });

  it("un bot sin cuenta de papel no es ni lo uno ni lo otro", () => {
    const ganando = filtrarBots(bots, FILTROS({ resultado: "GANANDO" }));
    const perdiendo = filtrarBots(bots, FILTROS({ resultado: "PERDIENDO" }));
    expect([...ganando, ...perdiendo].map((b) => b.nombre)).not.toContain("Sin cuenta");
  });

  it("«con posición» son los que están dentro del mercado ahora", () => {
    const dentro = [bot({ nombre: "Dentro", tienePosicion: true }), bot({ nombre: "Fuera" })];
    expect(filtrarBots(dentro, FILTROS({ resultado: "EN_MERCADO" })).map((b) => b.nombre)).toEqual([
      "Dentro",
    ]);
  });
});

describe("estado y familia", () => {
  const bots = [
    bot({ nombre: "Encendido", encendido: true, familia: "HFT" }),
    bot({ nombre: "Apagado", encendido: false, familia: "SWING" }),
  ];

  it("separa encendidos de apagados", () => {
    expect(filtrarBots(bots, FILTROS({ estado: "ENCENDIDOS" })).map((b) => b.nombre)).toEqual([
      "Encendido",
    ]);
    expect(filtrarBots(bots, FILTROS({ estado: "APAGADOS" })).map((b) => b.nombre)).toEqual([
      "Apagado",
    ]);
  });

  it("filtra por familia", () => {
    expect(filtrarBots(bots, FILTROS({ familia: "HFT" })).map((b) => b.nombre)).toEqual([
      "Encendido",
    ]);
  });

  it("los filtros se acumulan", () => {
    expect(filtrarBots(bots, FILTROS({ familia: "HFT", estado: "APAGADOS" }))).toEqual([]);
  });
});

describe("el orden", () => {
  it("por P&L, el que más pierde primero no: el que más gana", () => {
    const bots = [bot({ nombre: "B", pnl: 10 }), bot({ nombre: "A", pnl: 100 })];
    expect(filtrarBots(bots, FILTROS({ orden: "PNL" })).map((b) => b.nombre)).toEqual(["A", "B"]);
  });

  it("por operaciones, el que más ha operado primero", () => {
    const bots = [bot({ nombre: "Poco", operaciones: 2 }), bot({ nombre: "Mucho", operaciones: 90 })];
    expect(filtrarBots(bots, FILTROS({ orden: "OPERACIONES" })).map((b) => b.nombre)).toEqual([
      "Mucho",
      "Poco",
    ]);
  });

  /**
   * Sin desempate, dos bots con el mismo resultado cambian de sitio entre
   * recargas y la tabla parece moverse sola.
   */
  it("desempata por nombre, siempre", () => {
    const bots = [bot({ nombre: "Zeta", pnl: 5 }), bot({ nombre: "Alfa", pnl: 5 })];
    expect(filtrarBots(bots, FILTROS({ orden: "PNL" })).map((b) => b.nombre)).toEqual([
      "Alfa",
      "Zeta",
    ]);
  });

  it("por nombre, en español: la eñe va después de la ene", () => {
    const bots = [bot({ nombre: "Ñu" }), bot({ nombre: "Nube" })];
    expect(filtrarBots(bots, FILTROS({ orden: "NOMBRE" })).map((b) => b.nombre)).toEqual([
      "Nube",
      "Ñu",
    ]);
  });
});

describe("las familias que se ofrecen", () => {
  it("son sólo las que de verdad hay", () => {
    const bots = [bot({ familia: "HFT" }), bot({ familia: "HFT" }), bot({ familia: null })];
    expect(familiasPresentes(bots, (f) => f)).toEqual([{ valor: "HFT", texto: "HFT" }]);
  });

  it("salen por su rótulo y en orden alfabético", () => {
    const bots = [bot({ familia: "SWING" }), bot({ familia: "INTRADIA" })];
    const etiquetas: Record<string, string> = { SWING: "Swing", INTRADIA: "Intradía" };
    expect(familiasPresentes(bots, (f) => etiquetas[f] ?? f).map((x) => x.texto)).toEqual([
      "Intradía",
      "Swing",
    ]);
  });
});
