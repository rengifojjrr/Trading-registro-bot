import { describe, expect, it } from "vitest";

import { evaluateSyncHealth } from "./freshness";

const NOW = new Date("2026-08-17T12:00:00Z");

function minutesAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60_000).toISOString();
}

describe("evaluateSyncHealth", () => {
  it("marca NEVER cuando nunca hubo una sincronización correcta", () => {
    const health = evaluateSyncHealth({
      lastSuccessAt: null,
      intervalMinutes: 5,
      autoSyncEnabled: true,
      now: NOW,
    });
    expect(health.freshness).toBe("NEVER");
    expect(health.minutesSince).toBeNull();
  });

  it("una sincronización reciente está fresca", () => {
    const health = evaluateSyncHealth({
      lastSuccessAt: minutesAgo(4),
      intervalMinutes: 5,
      autoSyncEnabled: true,
      now: NOW,
    });
    expect(health.freshness).toBe("FRESH");
  });

  it("no marca como tarde a los 3 intervalos si eso es sólo unos minutos", () => {
    // Con intervalo de 1 minuto, 3 minutos de retraso no es noticia.
    const health = evaluateSyncHealth({
      lastSuccessAt: minutesAgo(5),
      intervalMinutes: 1,
      autoSyncEnabled: true,
      now: NOW,
    });
    expect(health.freshness).toBe("FRESH");
  });

  it("marca LATE pasados varios intervalos", () => {
    const health = evaluateSyncHealth({
      lastSuccessAt: minutesAgo(40),
      intervalMinutes: 10,
      autoSyncEnabled: true,
      now: NOW,
    });
    expect(health.freshness).toBe("LATE");
  });

  it("reproduce el caso real: cinco días sin sincronizar es STALE", () => {
    // Lo que ocurrió de verdad: última sincronización el 12, hoy es el 17,
    // y el panel seguía diciendo que la posición estaba abierta.
    const health = evaluateSyncHealth({
      lastSuccessAt: "2026-08-12T18:06:03Z",
      intervalMinutes: 5,
      autoSyncEnabled: false,
      now: NOW,
    });
    expect(health.freshness).toBe("STALE");
    expect(health.message).toContain("seguirá apareciendo como abierta");
    expect(health.message).toContain("automática está desactivada");
  });

  it("no menciona la sincronización automática cuando está activada", () => {
    const health = evaluateSyncHealth({
      lastSuccessAt: minutesAgo(60 * 24),
      intervalMinutes: 5,
      autoSyncEnabled: true,
      now: NOW,
    });
    expect(health.freshness).toBe("STALE");
    expect(health.message).not.toContain("automática está desactivada");
  });

  it("el umbral escala con el intervalo configurado", () => {
    // Dos horas de retraso es mucho con intervalo de 5 minutos...
    expect(
      evaluateSyncHealth({
        lastSuccessAt: minutesAgo(120),
        intervalMinutes: 5,
        autoSyncEnabled: true,
        now: NOW,
      }).freshness,
    ).toBe("STALE");

    // ...y es normal con intervalo de 60.
    expect(
      evaluateSyncHealth({
        lastSuccessAt: minutesAgo(120),
        intervalMinutes: 60,
        autoSyncEnabled: true,
        now: NOW,
      }).freshness,
    ).toBe("FRESH");
  });

  it("nunca devuelve minutos negativos si el reloj va por detrás", () => {
    const health = evaluateSyncHealth({
      lastSuccessAt: new Date(NOW.getTime() + 60_000).toISOString(),
      intervalMinutes: 5,
      autoSyncEnabled: true,
      now: NOW,
    });
    expect(health.minutesSince).toBe(0);
  });
});
