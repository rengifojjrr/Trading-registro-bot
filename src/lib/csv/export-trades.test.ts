import { describe, expect, it } from "vitest";

import type { TradeTableRow } from "@/lib/analytics/queries";

import { csvFilename, tradesToCsv } from "./export-trades";

const operacion = (over: Partial<TradeTableRow> = {}): TradeTableRow =>
  ({
    id: "abc",
    product_id: "BIP-20DEC30-CDE",
    account_id: "cuenta",
    direction: "SHORT",
    status: "CLOSED",
    opened_at: "2026-08-18T01:26:59.154Z",
    closed_at: "2026-08-19T13:32:08.892Z",
    duration_seconds: 130509,
    max_size: "60",
    total_entry_qty: "60",
    total_exit_qty: "60",
    entry_wap: "64298.1666666667",
    exit_wap: "65190",
    notional_value: "38578.9",
    total_commissions: "70.71",
    gross_pnl: "-535.1",
    net_pnl: "-605.81",
    return_pct: "-1.57",
    entries_count: 7,
    exits_count: 5,
    session_effective: "LONDON",
    source: "COINBASE_SYNC",
    is_manually_adjusted: false,
    ...over,
  }) as TradeTableRow;

describe("exportar operaciones a CSV", () => {
  it("saca una cabecera y una línea por operación", () => {
    const csv = tradesToCsv([operacion()]);
    const lineas = csv.split("\n");
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toContain("resultado_neto");
    expect(lineas[1]).toContain("-605.81");
  });

  it("sin operaciones deja la cabecera, no un archivo vacío", () => {
    // Un archivo de cero bytes parece un error de descarga; una cabecera sola
    // dice «se exportó bien y no había nada».
    expect(tradesToCsv([]).split("\n")).toHaveLength(1);
  });

  it("los números van con punto y sin símbolo de moneda", () => {
    // Un CSV lo lee una hoja de cálculo, no una persona: «1.234,56 $» entra
    // como texto y entonces no se puede ni sumar la columna.
    const csv = tradesToCsv([operacion()]);
    expect(csv).toContain("64298.1666666667");
    expect(csv).not.toContain("$");
    expect(csv).not.toContain("−");
  });

  it("las fechas van en ISO, no en formato de pantalla", () => {
    expect(tradesToCsv([operacion()])).toContain("2026-08-18T01:26:59.154Z");
  });

  it("escapa las comas, las comillas y los saltos de línea", () => {
    const csv = tradesToCsv([operacion({ product_id: 'RARO,"CON" COMAS' })]);
    expect(csv).toContain('"RARO,""CON"" COMAS"');
  });

  it("no entrecomilla lo que no lo necesita", () => {
    // Entrecomillarlo todo funciona y hace el archivo ilegible al abrirlo con
    // un editor de texto, que es justo cuando quieres mirarlo por encima.
    expect(tradesToCsv([operacion()])).toContain(",BIP-20DEC30-CDE,");
  });

  it("una operación abierta deja vacíos los campos de cierre, no «null»", () => {
    const csv = tradesToCsv([
      operacion({ status: "OPEN", closed_at: null, exit_wap: null, net_pnl: null, duration_seconds: null }),
    ]);
    expect(csv).not.toContain("null");
    expect(csv).toContain(",,");
  });

  it("el nombre del archivo dice qué periodo lleva dentro", () => {
    expect(csvFilename({ from: "2026-08-01", to: "2026-08-31" })).toBe(
      "operaciones_2026-08-01_a_2026-08-31.csv",
    );
    expect(csvFilename({})).toBe("operaciones.csv");
  });
});
