import { describe, expect, it } from "vitest";

import { CSV_BOM, moduleCsvFilename, rowsToCsv, type CsvColumn } from "./export-rows";

interface Fila {
  fecha: string;
  nota: string | null;
  minutos: number | null;
}

const COLUMNAS: CsvColumn<Fila>[] = [
  { header: "Fecha", value: (r) => r.fecha },
  { header: "Nota", value: (r) => r.nota },
  { header: "Minutos", value: (r) => r.minutos },
];

describe("sacar filas a CSV", () => {
  it("pone la cabecera aunque no haya filas", () => {
    // Un archivo vacío del todo parece que la exportación falló.
    expect(rowsToCsv([], COLUMNAS)).toBe("Fecha,Nota,Minutos");
  });

  it("escribe una fila normal sin entrecomillar de más", () => {
    // Entrecomillar todo es correcto y es ilegible al abrirlo en un editor,
    // que es la mitad de las veces que se abre un CSV.
    const csv = rowsToCsv([{ fecha: "2026-08-25", nota: "bien", minutos: 480 }], COLUMNAS);
    expect(csv.split("\n")[1]).toBe("2026-08-25,bien,480");
  });

  it("entrecomilla cuando hay una coma dentro", () => {
    const csv = rowsToCsv([{ fecha: "2026-08-25", nota: "dormí mal, me desperté", minutos: 300 }], COLUMNAS);
    expect(csv.split("\n")[1]).toBe('2026-08-25,"dormí mal, me desperté",300');
  });

  it("dobla las comillas de dentro", () => {
    const csv = rowsToCsv([{ fecha: "2026-08-25", nota: 'dijo "ya"', minutos: null }], COLUMNAS);
    expect(csv.split("\n")[1]).toBe('2026-08-25,"dijo ""ya""",');
  });

  it("aguanta un salto de línea dentro de una nota", () => {
    // Una nota de varias líneas es lo normal en el diario, y sin entrecomillar
    // partiría la fila en dos y descuadraría el archivo entero a partir de ahí.
    const csv = rowsToCsv([{ fecha: "2026-08-25", nota: "una\ndos", minutos: 1 }], COLUMNAS);
    expect(csv).toContain('"una\ndos"');
    expect(csv.split("\n")).toHaveLength(3);
  });

  it("deja vacío lo que no hay, en vez de escribir null", () => {
    const csv = rowsToCsv([{ fecha: "2026-08-25", nota: null, minutos: null }], COLUMNAS);
    expect(csv.split("\n")[1]).toBe("2026-08-25,,");
    expect(csv).not.toContain("null");
  });

  it("los decimales van con punto", () => {
    const csv = rowsToCsv([{ fecha: "x", nota: null, minutos: 7.5 }], COLUMNAS);
    expect(csv).toContain("7.5");
  });
});

describe("el nombre del archivo", () => {
  it("lleva el módulo y la fecha", () => {
    // Sin fecha, el segundo se llama «habitos (1).csv» y ya nadie sabe cuál es.
    expect(moduleCsvFilename("habitos", new Date("2026-08-25T10:00:00Z"))).toBe(
      "habitos_2026-08-25.csv",
    );
  });
});

describe("el BOM", () => {
  it("es el que Excel en Windows necesita para los acentos", () => {
    // Sin él, «sueño» se abre como «sueÃ±o», y una exportación que hay que
    // arreglar a mano no se vuelve a usar.
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});
