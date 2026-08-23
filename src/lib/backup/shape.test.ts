import { describe, expect, it } from "vitest";

import {
  compareToLive,
  ESSENTIAL_TABLES,
  inspectBackup,
  IRREPLACEABLE_TABLES,
} from "./shape";

const completa = () => {
  const payload: Record<string, unknown> = { exportedAt: "2026-08-23T03:10:00.000Z" };
  for (const t of [...ESSENTIAL_TABLES, ...IRREPLACEABLE_TABLES]) payload[t] = [];
  payload.raw_fills = [{ entry_id: "a" }, { entry_id: "b" }];
  payload.products = [{ product_id: "BIT-31OCT26-CDE" }];
  return payload;
};

describe("mirar una copia de seguridad", () => {
  it("rechaza lo que no es una copia", () => {
    // Un fichero equivocado tiene que fallar aquí y no el día del desastre.
    expect(inspectBackup(null).ok).toBe(false);
    expect(inspectBackup("{}").ok).toBe(false);
    expect(inspectBackup([1, 2]).ok).toBe(false);
  });

  it("acepta una copia completa y cuenta las filas", () => {
    const informe = inspectBackup(completa());
    expect(informe.ok).toBe(true);
    expect(informe.problems).toEqual([]);
    expect(informe.totalRows).toBe(3);
    expect(informe.exportedAt).toBe("2026-08-23T03:10:00.000Z");
  });

  it("falla si falta una tabla sin la que no se reconstruye nada", () => {
    const rota = completa();
    delete rota.products;
    const informe = inspectBackup(rota);
    expect(informe.ok).toBe(false);
    expect(informe.problems.join(" ")).toContain("products");
  });

  it("falla si la capa cruda vino vacía", () => {
    // Es el fallo silencioso peor: el fichero existe, pesa, y no tiene nada.
    const vacia = completa();
    vacia.raw_fills = [];
    const informe = inspectBackup(vacia);
    expect(informe.ok).toBe(false);
    expect(informe.problems.join(" ")).toContain("raw_fills");
  });

  it("avisa, sin fallar, de una tabla que solo tiene lo escrito a mano", () => {
    const sinDiario = completa();
    delete sinDiario.journal_entries;
    const informe = inspectBackup(sinDiario);
    expect(informe.ok).toBe(true);
    expect(informe.warnings.join(" ")).toContain("journal_entries");
  });

  it("avisa cuando la copia no dice de cuándo es", () => {
    const sinFecha = completa();
    delete sinFecha.exportedAt;
    expect(inspectBackup(sinFecha).warnings.join(" ")).toContain("cuándo");
  });
});

describe("comparar la copia con lo que hay hoy", () => {
  it("dice que está al día cuando no falta nada", () => {
    const informe = inspectBackup(completa());
    const drift = compareToLive(informe, { raw_fills: 2, products: 1 });
    expect(drift.stale).toBe(false);
  });

  it("dice cuántas filas se perderían, no solo que está vieja", () => {
    // El número es lo que hace decidir si toca hacer una copia ahora mismo.
    const informe = inspectBackup(completa());
    const drift = compareToLive(informe, { raw_fills: 40, products: 1, journal_entries: 5 });
    expect(drift.stale).toBe(true);
    expect(drift.message).toContain("43");
    expect(drift.message).toContain("raw_fills");
  });

  it("no cuenta como pérdida que la copia tenga más que la base", () => {
    // Restaurar una copia con filas que ya se borraron a propósito no pierde
    // nada: las devuelve. Marcarlo como pérdida sería mentir en la dirección
    // que hace desconfiar de la copia justo cuando hay que usarla.
    const informe = inspectBackup(completa());
    const drift = compareToLive(informe, { raw_fills: 1, products: 1 });
    expect(drift.stale).toBe(false);
    expect(drift.rows.find((r) => r.table === "raw_fills")?.missing).toBe(0);
  });
});
