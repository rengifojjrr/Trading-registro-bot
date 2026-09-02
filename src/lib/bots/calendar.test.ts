import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { nextReview, reviewCalendar, reviewsOn } from "./calendar";

describe("reviewsOn", () => {
  it("entre semana no hay nada", () => {
    expect(reviewsOn(DateTime.fromISO("2026-09-02", { zone: "UTC" }))).toEqual([]);
  });

  it("el primer domingo de mes suma la mensual", () => {
    const domingo = DateTime.fromISO("2026-09-06", { zone: "UTC" });
    const cadencias = reviewsOn(domingo);
    expect(cadencias).toContain("SEMANAL");
    expect(cadencias).toContain("MENSUAL");
    expect(cadencias).not.toContain("TRIMESTRAL");
  });

  it("el segundo domingo ya no es mensual", () => {
    expect(reviewsOn(DateTime.fromISO("2026-09-13", { zone: "UTC" }))).not.toContain("MENSUAL");
  });

  it("la quincenal cae en las semanas pares", () => {
    const par = DateTime.fromISO("2026-09-06", { zone: "UTC" });
    const impar = par.plus({ weeks: 1 });
    expect(reviewsOn(par).includes("QUINCENAL")).toBe(par.weekNumber % 2 === 0);
    expect(reviewsOn(impar).includes("QUINCENAL")).toBe(impar.weekNumber % 2 === 0);
    expect(reviewsOn(par).includes("QUINCENAL")).not.toBe(reviewsOn(impar).includes("QUINCENAL"));
  });

  it("el primer domingo de trimestre y el de enero suman las suyas", () => {
    expect(reviewsOn(DateTime.fromISO("2026-10-04", { zone: "UTC" }))).toContain("TRIMESTRAL");
    const enero = reviewsOn(DateTime.fromISO("2027-01-03", { zone: "UTC" }));
    expect(enero).toContain("TRIMESTRAL");
    expect(enero).toContain("ANUAL");
  });
});

describe("reviewCalendar", () => {
  it("empieza por hoy si hoy es domingo", () => {
    const sesiones = reviewCalendar(new Date("2026-09-06T15:00:00Z"), "UTC", 7);
    expect(sesiones[0].date).toBe("2026-09-06");
    expect(sesiones[0].isToday).toBe(true);
    expect(sesiones[0].daysUntil).toBe(0);
  });

  it("cuenta los días en la zona del usuario", () => {
    // A las 23:00 del sábado en UTC ya es domingo en Auckland.
    const sabadoNoche = new Date("2026-09-05T23:00:00Z");
    expect(reviewCalendar(sabadoNoche, "Pacific/Auckland", 7)[0].daysUntil).toBe(0);
    expect(reviewCalendar(sabadoNoche, "UTC", 7)[0].daysUntil).toBe(1);
  });

  it("cae en UTC si la zona no existe", () => {
    expect(reviewCalendar(new Date("2026-09-02T00:00:00Z"), "Marte/Olympus", 7)[0].date).toBe("2026-09-06");
  });

  it("cada sesión lleva su lista y su duración", () => {
    const [semanal] = reviewCalendar(new Date("2026-09-02T00:00:00Z"), "UTC", 7);
    expect(semanal.cadence).toBe("SEMANAL");
    expect(semanal.minutes).toBe(20);
    expect(semanal.checklist.length).toBeGreaterThan(0);
  });
});

describe("nextReview", () => {
  it("es la más amplia del próximo domingo", () => {
    const r = nextReview(new Date("2026-09-30T00:00:00Z"), "UTC");
    expect(r?.date).toBe("2026-10-04");
    expect(r?.cadence).toBe("TRIMESTRAL");
  });
});
