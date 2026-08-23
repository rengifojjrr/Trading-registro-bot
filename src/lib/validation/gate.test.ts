import { describe, expect, it } from "vitest";

import { evaluateValidationGate, type GateEvidence } from "./gate";

const todoBien = (over: Partial<GateEvidence> = {}): GateEvidence => ({
  manualMismatches: 0,
  manualMatches: 0,
  positionCheck: { matched: true },
  fillGaps: 0,
  unclassifiedFills: 0,
  hasSyncedSuccessfully: true,
  ...over,
});

describe("puerta de la sincronización automática", () => {
  it("se abre con las pruebas que la propia aplicación produce", () => {
    // Y sin pedir ninguna revisión a mano: la cuota de veinte fue justo lo que
    // mantuvo la puerta cerrada mientras el panel enseñaba una posición
    // fantasma.
    const gate = evaluateValidationGate(todoBien());
    expect(gate.canEnable).toBe(true);
    expect(gate.blockedReason).toBeNull();
    expect(gate.checks.every((c) => c.passed)).toBe(true);
  });

  it("no se abre si falta alguna ejecución por registrar", () => {
    // Es el fallo que lo empezó todo: un fill perdido descuadra la posición y
    // funde varias operaciones en una sola.
    const gate = evaluateValidationGate(todoBien({ fillGaps: 1 }));
    expect(gate.canEnable).toBe(false);
    expect(gate.blockedReason).toContain("guardado");
  });

  it("no se abre si la posición no coincide con Coinbase", () => {
    const gate = evaluateValidationGate(todoBien({ positionCheck: { matched: false } }));
    expect(gate.canEnable).toBe(false);
    expect(gate.blockedReason).toContain("Coinbase");
  });

  it("no se abre si nunca se ha podido comparar la posición", () => {
    // No saber no es lo mismo que cuadrar.
    expect(evaluateValidationGate(todoBien({ positionCheck: null })).canEnable).toBe(false);
  });

  it("una sola revisión a mano marcada como distinta bloquea", () => {
    // Aunque todo lo automático cuadre: si una persona miró y no le salió,
    // eso pesa más que cualquier comprobación de la máquina.
    const gate = evaluateValidationGate(todoBien({ manualMatches: 50, manualMismatches: 1 }));
    expect(gate.canEnable).toBe(false);
    expect(gate.blockedReason).toContain("diferentes");
  });

  it("no se abre antes de la primera sincronización", () => {
    expect(evaluateValidationGate(todoBien({ hasSyncedSuccessfully: false })).canEnable).toBe(false);
  });

  it("cuenta las revisiones a mano cuando las hay, sin exigirlas", () => {
    const gate = evaluateValidationGate(todoBien({ manualMatches: 7 }));
    expect(gate.canEnable).toBe(true);
    expect(gate.checks.at(-1)?.detail).toContain("7 operación(es)");
  });

  it("no se abre si Coinbase mandó ajustes que el cálculo no sabe aplicar", () => {
    // Una reversión sin aplicar mueve la posición tanto como un fill que
    // falta. Aplicarla a ojo la movería en la dirección contraria, así que se
    // aparta -- y mientras esté apartada, las cifras no son de fiar.
    const gate = evaluateValidationGate(todoBien({ unclassifiedFills: 2 }));
    expect(gate.canEnable).toBe(false);
    expect(gate.blockedReason).toContain("ajuste");
  });

  it("devuelve las cinco pruebas siempre, para poder enseñarlas como lista", () => {
    const gate = evaluateValidationGate(todoBien({ fillGaps: 3, positionCheck: null }));
    expect(gate.checks).toHaveLength(5);
    expect(gate.checks.filter((c) => !c.passed)).toHaveLength(2);
  });

  it("el motivo que se enseña es el de la primera prueba que falla", () => {
    // Enseñar las cuatro a la vez convierte «arregla esto» en «arregla estas
    // cuatro cosas», y la primera suele ser la causa de las demás.
    const gate = evaluateValidationGate(
      todoBien({ hasSyncedSuccessfully: false, fillGaps: 2 }),
    );
    expect(gate.blockedReason).toContain("sincronización");
  });
});
