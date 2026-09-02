import { describe, expect, it } from "vitest";

import { evaluateSizeMismatch } from "./drift";

describe("evaluateSizeMismatch", () => {
  it("con los mismos contratos no hay nada que decir", () => {
    expect(evaluateSizeMismatch({ ourSize: "50", theirSize: "50" })).toBeNull();
    expect(evaluateSizeMismatch({ ourSize: "-22", theirSize: "-22" })).toBeNull();
  });

  it("Coinbase con menos contratos es un cierre sin sincronizar", () => {
    // El caso real: Coinbase liquidó 28 de 50 y la aplicación seguía en 50.
    const r = evaluateSizeMismatch({ ourSize: "50", theirSize: "22" });
    expect(r?.severity).toBe("SIZE_MISMATCH");
    expect(r?.difference).toBe("-28");
    expect(r?.message).toContain("Coinbase tiene 22 contratos largos y aquí hay 50 contratos largos");
    expect(r?.message).toContain("faltan 28 contratos de cierre");
    expect(r?.message).toContain("liquidación");
  });

  it("Coinbase con más contratos es una apertura sin sincronizar", () => {
    const r = evaluateSizeMismatch({ ourSize: "10", theirSize: "12" });
    expect(r?.message).toContain("faltan 2 contratos de apertura");
  });

  it("un largo contra un corto del mismo tamaño también descuadra", () => {
    const r = evaluateSizeMismatch({ ourSize: "22", theirSize: "-22" });
    expect(r?.severity).toBe("SIZE_MISMATCH");
    expect(r?.message).toContain("22 contratos cortos");
    expect(r?.message).toContain("22 contratos largos");
  });

  it("habla en singular cuando falta uno", () => {
    const r = evaluateSizeMismatch({ ourSize: "2", theirSize: "1" });
    expect(r?.message).toContain("faltan 1 contrato de cierre");
    expect(r?.message).toContain("1 contrato largos");
  });
});
