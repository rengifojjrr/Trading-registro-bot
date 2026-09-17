import { describe, expect, it } from "vitest";

import { guideFor, SESGO_LABELS } from "./indicator-guide";

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

describe("de qué lado cae cada escenario", () => {
  const CASOS = [
    { titulo: "Retail Sales MoM", encima: "BAJISTA", debajo: "ALCISTA" },
    { titulo: "Core Inflation Rate MoM", encima: "BAJISTA", debajo: "ALCISTA" },
    { titulo: "Fed Interest Rate Decision", encima: "BAJISTA", debajo: "ALCISTA" },
    // Los datos de empleo y crecimiento tienen las dos lecturas a la vez, y
    // fingir una sola sería el error que este campo existe para evitar.
    { titulo: "Non Farm Payrolls", encima: "MIXTO", debajo: "MIXTO" },
    { titulo: "GDP Growth Rate QoQ", encima: "MIXTO", debajo: "MIXTO" },
    // Más paro es ambiguo (recortes, pero miedo a recesión); menos paro no lo
    // es: economía fuerte y tipos altos más tiempo.
    { titulo: "Unemployment Rate", encima: "MIXTO", debajo: "BAJISTA" },
    // Más subsidios es enfriamiento: acerca los recortes.
    { titulo: "Initial Jobless Claims", encima: "ALCISTA", debajo: "BAJISTA" },
  ] as const;

  for (const caso of CASOS) {
    it(`«${caso.titulo}»: por encima ${caso.encima}, por debajo ${caso.debajo}`, () => {
      const guide = guideFor({ title: caso.titulo, indicator: null });
      expect(guide).not.toBeNull();
      expect(guide?.sesgoEncima).toBe(caso.encima);
      expect(guide?.sesgoDebajo).toBe(caso.debajo);
    });
  }

  it("cada rama tiene sesgo y cada sesgo tiene etiqueta", () => {
    for (const caso of CASOS) {
      const guide = guideFor({ title: caso.titulo, indicator: null });
      if (!guide) throw new Error(`sin ficha: ${caso.titulo}`);
      expect(SESGO_LABELS[guide.sesgoEncima]).toBeTruthy();
      expect(SESGO_LABELS[guide.sesgoDebajo]).toBeTruthy();
    }
  });

  it("cuando el sesgo es mixto, el texto explica las dos lecturas", () => {
    const guide = guideFor({ title: "Non Farm Payrolls", indicator: null });
    // Sin esa explicación, «Tiene dos lecturas opuestas» sería una etiqueta
    // que deja al lector peor de como estaba.
    expect(guide?.porEncima.toLowerCase()).toMatch(/dos lecturas|tensión|depende/);
  });
});

/**
 * El orden de las reglas es lo frágil de este módulo.
 *
 * Gana la primera que encaja y el emparejamiento es por subcadena, así que una
 * regla general puesta demasiado arriba se come a todas las que vienen detrás.
 * La de «speech» es la más peligrosa: puesta antes de tiempo convertiría la
 * decisión de tipos y los discursos del presidente en «una intervención de
 * alguien de la Reserva Federal».
 */
describe("lo específico gana a lo general", () => {
  const ficha = (title: string, indicator: string | null = "Interest Rate") =>
    guideFor({ title, indicator });

  it("un discurso de un gobernador de la Fed cae en la ficha de la Fed", () => {
    expect(ficha("Fed Bowman Speech")?.mide).toMatch(/Reserva Federal/);
    expect(ficha("Fed Waller Speech")?.mide).toMatch(/Reserva Federal/);
  });

  it("la decisión de tipos no se la come la regla de los discursos", () => {
    expect(ficha("Fed Interest Rate Decision")?.mide).toMatch(/tipo de interés oficial/i);
  });

  it("la rueda de prensa tampoco", () => {
    expect(ficha("Fed Press Conference")?.mide).toMatch(/comparecencia del presidente/i);
  });

  /**
   * Un discurso del presidente del país y uno de un gobernador de la Fed no se
   * leen igual: el segundo habla de tipos y el primero de gasto, aranceles y
   * regulación. Meterlos en la misma ficha sería decirle al lector que
   * cualquiera de los dos significa lo mismo.
   */
  it("un discurso político no cae en la ficha de la Fed", () => {
    expect(ficha("US President Trump Speech")?.mide).toMatch(/comparecencia política/i);
    expect(ficha("Treasury Secretary Bessent Speech")?.mide).toMatch(/comparecencia política/i);
  });

  it("las peticiones continuadas no se confunden con las iniciales", () => {
    expect(ficha("Continuing Jobless Claims", null)?.mide).toMatch(/semana tras semana/);
    expect(ficha("Initial Jobless Claims", null)?.mide).toMatch(/por primera vez/i);
  });
});

describe("lo que se dice de lo que no se sabe bien", () => {
  /**
   * El balance de la Fed es el dato más discutido de la lista: la relación con
   * el precio es una correlación observada, no el mecanismo limpio de los
   * tipos. Decirlo es la diferencia entre una ficha y una promesa.
   */
  it("el balance de la Fed admite que es una correlación, no un mecanismo", () => {
    const guide = guideFor({ title: "Fed Balance Sheet", indicator: null });
    expect(guide?.nota?.toLowerCase()).toMatch(/discutido|correlación/);
  });

  it("el ADP admite que falla como anticipo del dato oficial", () => {
    const guide = guideFor({ title: "ADP Employment Change", indicator: null });
    expect(guide?.nota?.toLowerCase()).toMatch(/falla|desmiente/);
  });
});
