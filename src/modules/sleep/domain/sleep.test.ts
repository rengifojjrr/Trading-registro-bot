import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  clockFromTimestamp,
  defaultNightToLog,
  formatSleepDuration,
  nightLabel,
  resolveSleepTimestamps,
  summarise,
} from "./sleep";

const TZ = "America/Bogota";

function minutesBetween(a: string, b: string): number {
  return DateTime.fromISO(b).diff(DateTime.fromISO(a), "minutes").minutes;
}

describe("resolveSleepTimestamps", () => {
  it("acostarse de noche y despertar por la mañana cruza el día", () => {
    const { sleptAt, wokeAt } = resolveSleepTimestamps({
      sleepDate: "2026-08-19",
      bedtime: "23:00",
      wakeTime: "07:00",
      timezone: TZ,
    });
    expect(sleptAt).not.toBeNull();
    expect(minutesBetween(sleptAt!, wokeAt!)).toBe(480); // 8 horas
    expect(DateTime.fromISO(sleptAt!).setZone(TZ).toISODate()).toBe("2026-08-19");
    expect(DateTime.fromISO(wokeAt!).setZone(TZ).toISODate()).toBe("2026-08-20");
  });

  it("acostarse de madrugada pertenece al día siguiente de esa noche", () => {
    const { sleptAt, wokeAt } = resolveSleepTimestamps({
      sleepDate: "2026-08-19",
      bedtime: "02:00",
      wakeTime: "10:00",
      timezone: TZ,
    });
    // La noche es la del 19, pero acostarse a las 2am ya es el 20.
    expect(DateTime.fromISO(sleptAt!).setZone(TZ).toISODate()).toBe("2026-08-20");
    expect(minutesBetween(sleptAt!, wokeAt!)).toBe(480);
  });

  it("una siesta de tarde a tarde no salta un día entero", () => {
    const { sleptAt, wokeAt } = resolveSleepTimestamps({
      sleepDate: "2026-08-19",
      bedtime: "14:00",
      wakeTime: "16:30",
      timezone: TZ,
    });
    expect(minutesBetween(sleptAt!, wokeAt!)).toBe(150);
  });

  it("misma hora de acostarse y despertar son 24 horas, no cero", () => {
    const { sleptAt, wokeAt } = resolveSleepTimestamps({
      sleepDate: "2026-08-19",
      bedtime: "23:00",
      wakeTime: "23:00",
      timezone: TZ,
    });
    expect(minutesBetween(sleptAt!, wokeAt!)).toBe(1440);
  });

  it("no inventa instantes si falta una hora", () => {
    expect(
      resolveSleepTimestamps({ sleepDate: "2026-08-19", bedtime: "23:00", wakeTime: null, timezone: TZ }),
    ).toEqual({ sleptAt: null, wokeAt: null });
  });

  it("rechaza una hora imposible en lugar de redondearla", () => {
    expect(
      resolveSleepTimestamps({ sleepDate: "2026-08-19", bedtime: "25:00", wakeTime: "07:00", timezone: TZ }),
    ).toEqual({ sleptAt: null, wokeAt: null });
  });
});

describe("formatSleepDuration", () => {
  it("formatea horas y minutos", () => {
    expect(formatSleepDuration(440)).toBe("7h 20m");
    expect(formatSleepDuration(480)).toBe("8h");
    expect(formatSleepDuration(45)).toBe("45m");
    expect(formatSleepDuration(null)).toBe("--");
  });
});

describe("clockFromTimestamp", () => {
  it("devuelve HH:mm en la zona del usuario", () => {
    // 04:00 UTC son las 23:00 del día anterior en Bogotá.
    expect(clockFromTimestamp("2026-08-20T04:00:00Z", TZ)).toBe("23:00");
  });

  it("una fecha vacía no rompe el formulario", () => {
    expect(clockFromTimestamp(null, TZ)).toBe("");
  });
});

describe("summarise", () => {
  it("promedia sólo las noches con duración", () => {
    const stat = summarise([
      { durationMinutes: 480, score: 8 },
      { durationMinutes: 420, score: 6 },
      { durationMinutes: null, score: null },
    ]);
    expect(stat.nights).toBe(3);
    expect(stat.averageMinutes).toBe(450);
    expect(stat.averageScore).toBe(7);
  });

  it("una noche sin registrar no es una noche sin dormir", () => {
    // Si contara los nulos como cero, la media caería a 240.
    const stat = summarise([
      { durationMinutes: 480, score: null },
      { durationMinutes: null, score: null },
    ]);
    expect(stat.averageMinutes).toBe(480);
  });

  it("sin datos no inventa una media", () => {
    expect(summarise([]).averageMinutes).toBeNull();
  });
});

describe("defaultNightToLog", () => {
  it("por la mañana propone la noche de ayer, que es la que se acaba de dormir", () => {
    // 07:30 en Bogotá del 19 de agosto.
    const morning = new Date("2026-08-19T12:30:00Z");
    expect(defaultNightToLog(morning, "America/Bogota")).toBe("2026-08-18");
  });

  it("por la noche ya propone la de hoy", () => {
    // 22:00 en Bogotá del 19 de agosto.
    const evening = new Date("2026-08-20T03:00:00Z");
    expect(defaultNightToLog(evening, "America/Bogota")).toBe("2026-08-19");
  });

  it("usa la zona del usuario y no la del servidor", () => {
    // 21:00 UTC del 19 es todavía la tarde del 19 en Bogotá (16:00),
    // así que la noche propuesta es la del 18, no la del 19.
    const instant = new Date("2026-08-19T21:00:00Z");
    expect(defaultNightToLog(instant, "America/Bogota")).toBe("2026-08-18");
    expect(defaultNightToLog(instant, "UTC")).toBe("2026-08-19");
  });

  it("cae a UTC con una zona inválida en lugar de reventar", () => {
    const instant = new Date("2026-08-19T21:00:00Z");
    expect(defaultNightToLog(instant, "Nope/Nope")).toBe("2026-08-19");
  });
});

describe("nightLabel", () => {
  it("nombra la noche por su día de la semana", () => {
    expect(nightLabel("2026-08-18")).toBe("Noche del martes 18 de agosto");
  });
});
