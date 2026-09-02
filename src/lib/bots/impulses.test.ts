import { describe, expect, it } from "vitest";

import { evaluateImpulse, impulseReport, type ImpulseRecord } from "./impulses";
import type { ImpulseAction } from "./types";

function impulso(action: ImpulseAction, executed = false): ImpulseRecord {
  return {
    id: "i1",
    botId: "b1",
    botName: "Atún",
    action,
    note: null,
    executed,
    createdAt: "2026-08-01T12:00:00Z",
  };
}

function cerrada(netPnl: string, closedAt: string) {
  return { status: "CLOSED", closedAt, netPnl };
}

const semanaDespues = [
  cerrada("100", "2026-08-02T10:00:00Z"),
  cerrada("-40", "2026-08-05T10:00:00Z"),
  cerrada("70", "2026-08-08T11:00:00Z"),
  // Fuera de la ventana: justo pasados los siete días, y antes del impulso.
  cerrada("500", "2026-08-08T13:00:00Z"),
  cerrada("-500", "2026-08-01T11:00:00Z"),
];

describe("evaluateImpulse", () => {
  it("espera siete días antes de mirar", () => {
    const r = evaluateImpulse(impulso("APAGAR"), semanaDespues, new Date("2026-08-04T12:00:00Z"));
    expect(r.status).toBe("PENDIENTE");
    expect(r.daysLeft).toBe(4);
    expect(r.cost).toBeNull();
    expect(r.evaluableAt).toBe("2026-08-08T12:00:00.000Z");
  });

  it("apagar habría costado lo que el bot ganó esa semana", () => {
    const r = evaluateImpulse(impulso("APAGAR"), semanaDespues, new Date("2026-08-09T00:00:00Z"));
    expect(r.status).toBe("EVALUADO");
    expect(r.tradesAfter).toBe(3);
    expect(r.netAfter).toBe("130");
    expect(r.cost).toBe("130");
    expect(r.verdict).toContain("Multa que no pagaste");
  });

  it("reducir a la mitad cuenta la mitad", () => {
    const r = evaluateImpulse(impulso("REDUCIR"), semanaDespues, new Date("2026-08-09T00:00:00Z"));
    expect(r.cost).toBe("65");
  });

  it("cuando el bot perdió, tenías razón", () => {
    const r = evaluateImpulse(
      impulso("CERRAR"),
      [cerrada("-80", "2026-08-03T10:00:00Z")],
      new Date("2026-08-09T00:00:00Z"),
    );
    expect(r.cost).toBe("-80");
    expect(r.verdict).toContain("Tenías razón");
  });

  it("si el bot no cerró nada, no hay multa ni ahorro", () => {
    const r = evaluateImpulse(impulso("APAGAR"), [], new Date("2026-08-09T00:00:00Z"));
    expect(r.cost).toBe("0");
    expect(r.verdict).toContain("no cerró nada");
  });

  it("lo ejecutado no tiene contrafactual", () => {
    const r = evaluateImpulse(impulso("APAGAR", true), semanaDespues, new Date("2026-08-09T00:00:00Z"));
    expect(r.status).toBe("EJECUTADO");
    expect(r.cost).toBeNull();
  });

  it("subir el tamaño se apunta pero no se cuantifica", () => {
    const r = evaluateImpulse(impulso("SUBIR"), semanaDespues, new Date("2026-08-09T00:00:00Z"));
    expect(r.status).toBe("SIN_CIFRA");
    expect(r.cost).toBeNull();
  });
});

describe("impulseReport", () => {
  it("suma las multas que no pagaste y las veces que tenías razón", () => {
    const ahora = new Date("2026-08-09T00:00:00Z");
    const evaluaciones = [
      evaluateImpulse(impulso("APAGAR"), semanaDespues, ahora),
      evaluateImpulse(impulso("CERRAR"), [cerrada("-80", "2026-08-03T10:00:00Z")], ahora),
      evaluateImpulse(impulso("APAGAR", true), semanaDespues, ahora),
      evaluateImpulse(impulso("APAGAR"), semanaDespues, new Date("2026-08-02T00:00:00Z")),
    ];

    const r = impulseReport(evaluaciones);
    expect(r.total).toBe(4);
    expect(r.evaluated).toBe(2);
    expect(r.executed).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.avoided).toBe("130");
    expect(r.missed).toBe("80");
    expect(r.balance).toBe("50");
    expect(r.botWasRight).toBe(1);
    expect(r.youWereRight).toBe(1);
  });
});
