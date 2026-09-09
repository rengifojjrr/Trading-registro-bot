import { describe, expect, it } from "vitest";

import { guideFor } from "./indicator-guide";

/** Como los devuelve la fuente: título corto e indicador largo. */
const ev = (title: string, indicator: string | null = null) => ({ title, indicator });

describe("guideFor", () => {
  it("distingue las tres caras de la Reserva Federal, que comparten indicador", () => {
    // Las tres llegan con indicator "Interest Rate"; sólo el título las separa,
    // y significan cosas muy distintas.
    expect(guideFor(ev("Fed Interest Rate Decision", "Interest Rate"))!.mide).toContain(
      "tipo de interés oficial",
    );
    expect(guideFor(ev("Fed Press Conference", "Interest Rate"))!.mide).toContain("comparecencia");
    expect(guideFor(ev("FOMC Minutes", "Interest Rate"))!.mide).toContain("actas");
    expect(guideFor(ev("FOMC Economic Projections", "Interest Rate"))!.mide).toContain("previsiones");
  });

  it("la inflación subyacente gana a la general, no al revés", () => {
    // "Core Inflation Rate MoM" contiene "inflation rate", así que el orden de
    // las reglas es lo único que impide que se explique como el dato general.
    const subyacente = guideFor(ev("Core Inflation Rate MoM", "Core Inflation Rate MoM"))!;
    expect(subyacente.mide).toContain("dejando fuera alimentos y energía");

    const general = guideFor(ev("Inflation Rate YoY", "Inflation Rate"))!;
    expect(general.mide).toContain("IPC");
  });

  it("los precios de producción no se confunden con los de consumo", () => {
    const ppi = guideFor(ev("PPI MoM", "Producer Price Inflation MoM"))!;
    expect(ppi.mide).toContain("productores");

    const corePpi = guideFor(ev("Core PPI MoM", "Core Producer Prices MoM"))!;
    expect(corePpi.mide).toContain("productores");
  });

  it("cubre el empleo, el crecimiento y el consumo", () => {
    expect(guideFor(ev("Non Farm Payrolls"))!.mide).toContain("empleos");
    expect(guideFor(ev("Initial Jobless Claims"))!.mide).toContain("subsidio");
    expect(guideFor(ev("Unemployment Rate"))!.mide).toContain("población activa");
    expect(guideFor(ev("GDP Growth Rate QoQ Adv"))!.mide).toContain("economía");
    expect(guideFor(ev("Retail Sales MoM"))!.mide).toContain("consumidores");
    expect(guideFor(ev("ISM Services PMI"))!.mide).toContain("directores de compras");
  });

  it("siempre trae las dos lecturas, por encima y por debajo", () => {
    const g = guideFor(ev("Core Inflation Rate MoM"))!;
    expect(g.porEncima.length).toBeGreaterThan(20);
    expect(g.porDebajo.length).toBeGreaterThan(20);
  });

  it("lo que no se conoce bien no se explica", () => {
    // Preferible callar a improvisar una explicación macro plausible: la
    // pantalla cae a la definición de la fuente cuando esto es null.
    expect(guideFor(ev("EIA Cushing Crude Oil Stocks Change"))).toBeNull();
    expect(guideFor(ev("4-Week Bill Auction"))).toBeNull();
    expect(guideFor(ev("Consumer Inflation Expectations", "Inflation Expectations"))).toBeNull();
    expect(guideFor(ev("NFIB Business Optimism Index"))).toBeNull();
  });

  it("no distingue mayúsculas", () => {
    expect(guideFor(ev("NON FARM PAYROLLS"))).not.toBeNull();
  });
});
