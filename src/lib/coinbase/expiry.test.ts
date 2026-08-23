import { describe, expect, it } from "vitest";

import { evaluateExpiry } from "./expiry";

const AHORA = new Date("2026-08-19T12:00:00Z");
const contrato = (expiry: string | null) =>
  evaluateExpiry({ productId: "BIP-20DEC30-CDE", contractExpiry: expiry, now: AHORA });

describe("vencimiento del contrato", () => {
  it("un perpetuo no vence nunca y no dice nada", () => {
    const estado = contrato(null);
    expect(estado.urgency).toBe("lejos");
    expect(estado.message).toBeNull();
  });

  it("callado mientras queda tiempo", () => {
    expect(contrato("2026-12-20T00:00:00Z").message).toBeNull();
  });

  it("avisa dos semanas antes, que es cuando aún puedes decidir", () => {
    const estado = contrato("2026-08-30T12:00:00Z");
    expect(estado.urgency).toBe("cerca");
    expect(estado.daysLeft).toBe(11);
    expect(estado.message).toContain("contrato siguiente");
  });

  it("aprieta los últimos tres días", () => {
    const estado = contrato("2026-08-21T12:00:00Z");
    expect(estado.urgency).toBe("inminente");
    expect(estado.message).toContain("se liquida solo");
  });

  it("después de vencer dice de quién es la posición que ves", () => {
    // Es el caso confuso: Coinbase ya liquidó y aquí sigue saliendo abierta.
    const estado = contrato("2026-08-17T12:00:00Z");
    expect(estado.urgency).toBe("vencido");
    expect(estado.daysLeft).toBe(-2);
    expect(estado.message).toContain("de esta aplicación, no tuya");
  });

  it("una fecha que no se entiende no inventa una urgencia", () => {
    expect(contrato("cuando sea").urgency).toBe("lejos");
  });

  it("el día del vencimiento todavía cuenta como inminente, no como vencido", () => {
    expect(contrato("2026-08-19T23:00:00Z").urgency).toBe("inminente");
  });
});
