import { describe, expect, it } from "vitest";

import { formatClockHours } from "@/core/clock";

import {
  bedtimeSpread,
  clockHours,
  durationSeries,
  durationVsScore,
  scheduleSeries,
  tagEffects,
  wakeHours,
  type AnalysableNight,
} from "./sleep-analysis";

const TZ = "America/Bogota";

function night(over: Partial<AnalysableNight> = {}): AnalysableNight {
  return {
    sleepDate: "2026-08-18",
    sleptAt: "2026-08-18T23:00:00-05:00",
    wokeAt: "2026-08-19T07:00:00-05:00",
    durationMinutes: 480,
    score: 8,
    beforeBed: [],
    ...over,
  };
}

describe("durationSeries", () => {
  it("va de la noche más antigua a la más reciente", () => {
    const series = durationSeries([
      night({ sleepDate: "2026-08-18", durationMinutes: 480 }),
      night({ sleepDate: "2026-08-16", durationMinutes: 300 }),
      night({ sleepDate: "2026-08-17", durationMinutes: 420 }),
    ]);

    expect(series.map((p) => p.value)).toEqual([5, 7, 8]);
  });

  it("omite las noches sin duración en lugar de dibujarlas a cero", () => {
    const series = durationSeries([night({ durationMinutes: null }), night({ sleepDate: "2026-08-19" })]);

    expect(series).toHaveLength(1);
  });

  it("redondea a un decimal de hora", () => {
    expect(durationSeries([night({ durationMinutes: 445 })])[0].value).toBe(7.4);
  });
});

describe("clockHours", () => {
  it("estira la madrugada por encima de las 24 para que la línea no se desplome", () => {
    const late = clockHours("2026-08-19T00:30:00-05:00", TZ);
    const early = clockHours("2026-08-18T23:30:00-05:00", TZ);

    expect(early).toBe(23.5);
    expect(late).toBe(24.5);
    // Una hora de diferencia real es una unidad de diferencia en la gráfica.
    expect((late as number) - (early as number)).toBe(1);
  });

  it("no estira una hora de la tarde", () => {
    expect(clockHours("2026-08-18T21:45:00-05:00", TZ)).toBe(21.75);
  });

  it("devuelve null sin marca de tiempo", () => {
    expect(clockHours(null, TZ)).toBeNull();
  });
});

describe("wakeHours", () => {
  it("no estira: levantarse a las 6 es 6, no 30", () => {
    expect(wakeHours("2026-08-19T06:15:00-05:00", TZ)).toBe(6.25);
  });
});

describe("formatClockHours", () => {
  it("devuelve la madrugada estirada a su hora real", () => {
    expect(formatClockHours(25.5)).toBe("01:30");
  });

  it("mantiene las horas normales", () => {
    expect(formatClockHours(23.5)).toBe("23:30");
  });

  it("no produce un 24:00 al redondear", () => {
    expect(formatClockHours(23.999)).toBe("00:00");
  });
});

describe("scheduleSeries", () => {
  it("separa acostarse de levantarse y salta las noches incompletas", () => {
    const { bedtime, wake } = scheduleSeries(
      [
        night({ sleepDate: "2026-08-17", sleptAt: "2026-08-17T22:00:00-05:00", wokeAt: null }),
        night({ sleepDate: "2026-08-18" }),
      ],
      TZ,
    );

    expect(bedtime).toHaveLength(2);
    expect(wake).toHaveLength(1);
    expect(wake[0].value).toBe(7);
  });
});

describe("durationVsScore", () => {
  it("sólo cruza noches que tienen las dos medidas", () => {
    const points = durationVsScore([
      night({ durationMinutes: 480, score: 9 }),
      night({ durationMinutes: 480, score: null }),
      night({ durationMinutes: null, score: 7 }),
    ]);

    expect(points).toEqual([{ x: 8, y: 9 }]);
  });
});

describe("tagEffects", () => {
  it("mide la diferencia contra la media general, no la duración suelta", () => {
    const nights = [
      night({ sleepDate: "2026-08-10", durationMinutes: 540, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-11", durationMinutes: 540, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-12", durationMinutes: 540, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-13", durationMinutes: 300, beforeBed: ["Trasnochar"] }),
      night({ sleepDate: "2026-08-14", durationMinutes: 300, beforeBed: ["Trasnochar"] }),
      night({ sleepDate: "2026-08-15", durationMinutes: 300, beforeBed: ["Trasnochar"] }),
    ];

    const effects = tagEffects(nights);

    expect(effects.map((e) => e.tag)).toEqual(["Leer", "Trasnochar"]);
    // Media general 420: leer suma dos horas, trasnochar resta dos.
    expect(effects[0].deltaMinutes).toBe(120);
    expect(effects[1].deltaMinutes).toBe(-120);
  });

  it("descarta las etiquetas con pocas noches, que serían ruido con forma de conclusión", () => {
    const nights = [
      night({ sleepDate: "2026-08-10", durationMinutes: 600, beforeBed: ["Bañarme"] }),
      night({ sleepDate: "2026-08-11", durationMinutes: 400, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-12", durationMinutes: 400, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-13", durationMinutes: 400, beforeBed: ["Leer"] }),
    ];

    expect(tagEffects(nights).map((e) => e.tag)).toEqual(["Leer"]);
  });

  it("no cuenta dos veces una etiqueta repetida en la misma noche", () => {
    const nights = [
      night({ sleepDate: "2026-08-10", durationMinutes: 480, beforeBed: ["Leer", "Leer"] }),
      night({ sleepDate: "2026-08-11", durationMinutes: 480, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-12", durationMinutes: 480, beforeBed: ["Leer"] }),
    ];

    expect(tagEffects(nights)[0].nights).toBe(3);
  });

  it("ignora las noches sin duración al calcular la media", () => {
    const nights = [
      night({ sleepDate: "2026-08-10", durationMinutes: null, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-11", durationMinutes: 480, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-12", durationMinutes: 480, beforeBed: ["Leer"] }),
      night({ sleepDate: "2026-08-13", durationMinutes: 480, beforeBed: ["Leer"] }),
    ];

    const [leer] = tagEffects(nights);
    expect(leer.nights).toBe(3);
    expect(leer.averageMinutes).toBe(480);
  });

  it("no devuelve nada sin noches medidas", () => {
    expect(tagEffects([night({ durationMinutes: null, beforeBed: ["Leer"] })])).toEqual([]);
  });
});

describe("bedtimeSpread", () => {
  it("delata un horario irregular que la media de sueño esconde", () => {
    const regular = bedtimeSpread(
      [
        night({ sleptAt: "2026-08-17T23:00:00-05:00" }),
        night({ sleptAt: "2026-08-18T23:00:00-05:00" }),
      ],
      TZ,
    );
    const caotic = bedtimeSpread(
      [
        night({ sleptAt: "2026-08-17T21:00:00-05:00" }),
        night({ sleptAt: "2026-08-19T03:00:00-05:00" }),
      ],
      TZ,
    );

    expect(regular).toBe(0);
    expect(caotic).toBeGreaterThan(150);
  });

  it("necesita al menos dos noches para hablar de variación", () => {
    expect(bedtimeSpread([night()], TZ)).toBeNull();
  });
});
