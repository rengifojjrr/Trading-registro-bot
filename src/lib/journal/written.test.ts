import { describe, expect, it } from "vitest";

import { hasJournalContent, type JournalContentRow } from "./written";

function fila(parcial: Partial<JournalContentRow> = {}): JournalContentRow {
  return {
    notes: null,
    lesson_learned: null,
    emotional_state: null,
    mistake_tag: null,
    strategy_id: null,
    ...parcial,
  };
}

describe("hasJournalContent", () => {
  it("sin fila no hay nada escrito", () => {
    expect(hasJournalContent(null)).toBe(false);
    expect(hasJournalContent(undefined)).toBe(false);
  });

  it("una fila vacía no cuenta: el formulario la crea al abrirlo", () => {
    expect(hasJournalContent(fila())).toBe(false);
  });

  it("un texto de sólo espacios tampoco", () => {
    expect(hasJournalContent(fila({ notes: "   " }))).toBe(false);
    expect(hasJournalContent(fila({ lesson_learned: "\n  \t" }))).toBe(false);
  });

  it("cualquiera de los cinco campos basta", () => {
    expect(hasJournalContent(fila({ notes: "entré por el rechazo" }))).toBe(true);
    expect(hasJournalContent(fila({ lesson_learned: "esperar" }))).toBe(true);
    expect(hasJournalContent(fila({ emotional_state: "Calma" }))).toBe(true);
    expect(hasJournalContent(fila({ mistake_tag: "Entré tarde" }))).toBe(true);
    expect(hasJournalContent(fila({ strategy_id: "a9c2f6d0-0000-4000-8000-000000000000" }))).toBe(true);
  });
});
