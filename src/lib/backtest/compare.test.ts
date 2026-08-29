import { describe, expect, it } from "vitest";

import { compareToReal, dayOf, type RealTradeDay } from "./compare";
import type { SimulatedTrade } from "./engine";

/** Lo mínimo que `compareToReal` mira de una operación simulada. */
const simulada = (exitTime: number): SimulatedTrade =>
  ({ exitTime, entryTime: exitTime - 3600, barsHeld: 1, exitReason: "OBJETIVO", trade: {} }) as never;

const DIA = 86400;
// Un mediodía UTC, para que la zona horaria no mueva el día sin querer.
const MEDIODIA = Math.floor(Date.UTC(2026, 7, 12, 12) / 1000);

describe("agrupar por día", () => {
  it("da la fecha en formato ordenable", () => {
    expect(dayOf(MEDIODIA, "UTC")).toBe("2026-08-12");
  });

  it("respeta la zona horaria", () => {
    // Las 02:00 UTC son todavía el día anterior en Bogotá.
    const madrugada = Math.floor(Date.UTC(2026, 7, 12, 2) / 1000);
    expect(dayOf(madrugada, "UTC")).toBe("2026-08-12");
    expect(dayOf(madrugada, "America/Bogota")).toBe("2026-08-11");
  });
});

describe("comparar con lo que hiciste", () => {
  const real: RealTradeDay[] = [
    { date: "2026-08-12", netPnl: "-100", trades: 4 },
    { date: "2026-08-13", netPnl: "50", trades: 1 },
  ];

  it("suma la estrategia por día y resta contra la realidad", () => {
    const resumen = compareToReal(
      [simulada(MEDIODIA), simulada(MEDIODIA + 60)],
      ["30", "20"],
      real,
      "UTC",
    );

    const doce = resumen.days.find((d) => d.date === "2026-08-12")!;
    expect(doce.strategyNet).toBe("50.00");
    expect(doce.strategyTrades).toBe(2);
    expect(doce.realNet).toBe("-100.00");
    // La regla lo habría hecho 150 mejor ese día.
    expect(doce.difference).toBe("150.00");
  });

  it("incluye los días en que sólo operó uno de los dos", () => {
    // Quedarse con la intersección escondería justamente el caso interesante.
    const resumen = compareToReal([simulada(MEDIODIA + 2 * DIA)], ["10"], real, "UTC");
    expect(resumen.days.map((d) => d.date)).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("cuenta los días en que operaste y la regla no", () => {
    // Es la cifra que más dice de un diario con FOMO.
    const resumen = compareToReal([], [], real, "UTC");
    expect(resumen.daysYouTradedAndRuleDidNot).toBe(2);
    expect(resumen.daysRuleTradedAndYouDidNot).toBe(0);
  });

  it("y al revés: oportunidades que te saltaste", () => {
    const resumen = compareToReal([simulada(MEDIODIA + 5 * DIA)], ["80"], [], "UTC");
    expect(resumen.daysRuleTradedAndYouDidNot).toBe(1);
    expect(resumen.daysYouTradedAndRuleDidNot).toBe(0);
  });

  it("cuenta quién ganó más días", () => {
    const resumen = compareToReal([simulada(MEDIODIA)], ["30"], real, "UTC");
    // El 12 gana la estrategia (+130); el 13 ganas tú (la regla no operó).
    expect(resumen.daysStrategyBetter).toBe(1);
    expect(resumen.daysYouBetter).toBe(1);
  });

  it("los totales cuadran con la suma de los días", () => {
    const resumen = compareToReal([simulada(MEDIODIA)], ["30"], real, "UTC");
    const sumaReal = resumen.days.reduce((a, d) => a + Number(d.realNet), 0);
    const sumaEstrategia = resumen.days.reduce((a, d) => a + Number(d.strategyNet), 0);
    expect(Number(resumen.totalReal)).toBeCloseTo(sumaReal, 6);
    expect(Number(resumen.totalStrategy)).toBeCloseTo(sumaEstrategia, 6);
    expect(Number(resumen.totalDifference)).toBeCloseTo(sumaEstrategia - sumaReal, 6);
  });

  it("una operación sin cerrar no se asigna a ningún día", () => {
    const resumen = compareToReal([simulada(0)], ["999"], real, "UTC");
    expect(resumen.totalStrategy).toBe("0.00");
  });

  it("sin nada por ninguno de los dos lados no revienta", () => {
    const resumen = compareToReal([], [], [], "UTC");
    expect(resumen.days).toHaveLength(0);
    expect(resumen.totalDifference).toBe("0.00");
  });
});
