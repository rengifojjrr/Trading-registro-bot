import { describe, expect, it } from "vitest";

import { planBulkApply, splitList, type ExistingJournal } from "./bulk-apply";

const vacia = (tradeId: string): ExistingJournal => ({
  tradeId,
  strategy_id: null,
  emotional_state: null,
  mistake_tag: null,
  lesson_learned: null,
  notes: null,
  plan_adherence: null,
  entry_quality: null,
  htf_bias: null,
  sr_proximity: null,
  mistakes: [],
});

const varias = (n: number) => Array.from({ length: n }, (_, i) => vacia(`t${i}`));

describe("planear una aplicación en bloque", () => {
  it("no cambia nada si no se marca ningún campo", () => {
    const plan = planBulkApply({ existing: varias(5), values: {}, mode: "OVERWRITE" });
    expect(plan.totalWrites).toBe(0);
    expect(plan.summary).toContain("No has marcado");
  });

  it("marcar un campo y dejarlo vacío no borra lo que hubiera", () => {
    // Es la diferencia entre «no quiero tocar esto» y «quiero vaciarlo», y
    // confundirlas convierte una etiqueta en una forma de perder el diario.
    const conNotas = { ...vacia("a"), notes: "Algo que escribí" };
    const plan = planBulkApply({
      existing: [conNotas],
      values: { notes: "   " },
      mode: "OVERWRITE",
    });
    expect(plan.totalWrites).toBe(0);
  });

  it("cuenta cuántas operaciones va a escribir", () => {
    const plan = planBulkApply({
      existing: varias(12),
      values: { mistakes: ["FOMO", "OVERTRADING"] },
      mode: "OVERWRITE",
    });
    expect(plan.trades).toBe(12);
    expect(plan.fields[0].willWrite).toBe(12);
    expect(plan.totalOverwrites).toBe(0);
    expect(plan.warning).toBeNull();
  });

  it("avisa antes de pisar algo ya escrito", () => {
    // «Se van a pisar 3 notas» cambia la decisión; «¿seguro?» no.
    const existing = [
      { ...vacia("a"), notes: "Lo de siempre" },
      { ...vacia("b"), notes: "Otra cosa" },
      vacia("c"),
    ];
    const plan = planBulkApply({ existing, values: { notes: "FOMO puro" }, mode: "OVERWRITE" });
    expect(plan.totalOverwrites).toBe(2);
    expect(plan.warning).toContain("2");
  });

  it("en modo rellenar-lo-vacío respeta lo anterior", () => {
    const existing = [{ ...vacia("a"), notes: "Lo de siempre" }, vacia("b")];
    const plan = planBulkApply({ existing, values: { notes: "FOMO puro" }, mode: "FILL_EMPTY" });
    expect(plan.fields[0].willWrite).toBe(1);
    expect(plan.fields[0].skipped).toBe(1);
    expect(plan.totalOverwrites).toBe(0);
  });

  it("escribir lo mismo que ya hay no cuenta como cambio", () => {
    // Si no, aplicar dos veces lo mismo avisaría de que va a «pisar» algo, y
    // el aviso dejaría de significar nada.
    const existing = [{ ...vacia("a"), mistakes: ["FOMO" as const] }];
    const plan = planBulkApply({ existing, values: { mistakes: ["FOMO"] }, mode: "OVERWRITE" });
    expect(plan.totalWrites).toBe(0);
    expect(plan.summary).toContain("no cambiaría nada");
  });

  it("las listas se comparan como conjunto: reordenar no es cambiar", () => {
    const existing = [{ ...vacia("a"), emotional_state: "FOMO, Ansiedad" }];
    const plan = planBulkApply({
      existing,
      values: { emotional_state: ["Ansiedad", "FOMO"] },
      mode: "OVERWRITE",
    });
    expect(plan.totalWrites).toBe(0);
  });

  it("un campo marcado no toca los demás", () => {
    // Aplicar «errores» no puede borrar las notas: el plan solo menciona lo
    // marcado, y lo que no aparece en el plan no se escribe.
    const existing = [{ ...vacia("a"), notes: "No me toques" }];
    const plan = planBulkApply({ existing, values: { mistakes: ["FOMO"] }, mode: "OVERWRITE" });
    expect(plan.fields.map((f) => f.field)).toEqual(["mistakes"]);
  });

  it("resume en castellano lo que va a pasar", () => {
    const plan = planBulkApply({
      existing: varias(8),
      values: { mistakes: ["FOMO"], notes: "Ráfaga de FOMO tras la pérdida" },
      mode: "OVERWRITE",
    });
    expect(plan.summary).toContain("8 operaciones");
    expect(plan.summary).toContain("errores");
    expect(plan.summary).toContain("notas");
  });

  it("habla en singular con una sola operación", () => {
    const plan = planBulkApply({ existing: varias(1), values: { notes: "x" }, mode: "OVERWRITE" });
    expect(plan.summary).toContain("1 operación");
    expect(plan.summary).not.toContain("1 operaciones");
  });

  it("una puntuación de cero se aplica: no es lo mismo que no marcar", () => {
    const plan = planBulkApply({
      existing: varias(3),
      values: { plan_adherence: 1 },
      mode: "OVERWRITE",
    });
    expect(plan.fields[0].willWrite).toBe(3);
  });
});

describe("leer las listas guardadas como texto", () => {
  it("parte por comas y limpia espacios", () => {
    expect(splitList(" FOMO ,  Ansiedad ")).toEqual(["FOMO", "Ansiedad"]);
  });

  it("aguanta null y cadenas vacías", () => {
    expect(splitList(null)).toEqual([]);
    expect(splitList(" , , ")).toEqual([]);
  });
});
