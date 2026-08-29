import { describe, expect, it } from "vitest";

import {
  AISLE_ORDER,
  groupByAisle,
  guessAisle,
  normaliseName,
  toPlainText,
  type ShoppingLine,
} from "./shopping";

const linea = (name: string, extra = false): ShoppingLine => ({
  key: name,
  name,
  amount: "2 ud",
  aisle: guessAisle(name),
  extra,
});

describe("normalizar", () => {
  it("quita acentos, mayúsculas y el plural simple", () => {
    expect(normaliseName("  Limones ")).toBe("limone");
    expect(normaliseName("Plátanos")).toBe("platano");
    expect(normaliseName("AJO")).toBe("ajo");
  });
});

describe("adivinar la zona", () => {
  it("lo obvio cae donde debe", () => {
    expect(guessAisle("Tomates")).toBe("FRESCO");
    expect(guessAisle("Leche entera")).toBe("NEVERA");
    expect(guessAisle("Arroz basmati")).toBe("DESPENSA");
    expect(guessAisle("Cerveza")).toBe("BEBIDA");
    expect(guessAisle("Papel de cocina")).toBe("LIMPIEZA");
  });

  it("gana la pista más larga, no la primera zona que casa", () => {
    // «tomate frito» está en despensa y «tomate» en fresco: buscando por orden
    // de zona, el bote acabaría en la sección de verdura.
    expect(guessAisle("Tomate frito")).toBe("DESPENSA");
    expect(guessAisle("Tomate")).toBe("FRESCO");
  });

  it("lo que no encaja cae en «lo demás», no en una zona al azar", () => {
    // Una categoría equivocada hace dar una vuelta buscando donde no está;
    // una vacía de significado sólo no ayuda.
    expect(guessAisle("Cosa rarísima")).toBe("OTROS");
    expect(guessAisle("")).toBe("OTROS");
  });

  it("aguanta acentos y mayúsculas", () => {
    expect(guessAisle("PLÁTANOS")).toBe("FRESCO");
    expect(guessAisle("Jabón de manos")).toBe("LIMPIEZA");
  });
});

describe("agrupar", () => {
  it("respeta el orden en que se recorre una tienda", () => {
    const grupos = groupByAisle([
      linea("Detergente"),
      linea("Tomates"),
      linea("Arroz"),
      linea("Leche"),
    ]);
    expect(grupos.map((g) => g.aisle)).toEqual(["FRESCO", "NEVERA", "DESPENSA", "LIMPIEZA"]);
  });

  it("las zonas vacías no salen", () => {
    // Un encabezado sin nada debajo es ruido en una pantalla que se mira con
    // una mano y el carro en la otra.
    const grupos = groupByAisle([linea("Tomates")]);
    expect(grupos).toHaveLength(1);
  });

  it("sin nada, ningún grupo", () => {
    expect(groupByAisle([])).toEqual([]);
  });

  it("todas las zonas del orden tienen etiqueta", () => {
    const grupos = groupByAisle(AISLE_ORDER.map((a) => ({ ...linea("x"), aisle: a })));
    expect(grupos.every((g) => g.label.length > 0)).toBe(true);
  });
});

describe("pasar a texto", () => {
  const grupos = groupByAisle([linea("Tomates"), linea("Leche"), linea("Arroz")]);

  it("agrupa con su encabezado", () => {
    const texto = toPlainText(grupos, new Set());
    expect(texto).toContain("FRESCO");
    expect(texto).toContain("- Tomates (2 ud)");
  });

  it("lo ya comprado no se manda", () => {
    // Quien recibe la lista quiere saber qué falta, no qué había.
    const texto = toPlainText(grupos, new Set(["Tomates"]));
    expect(texto).not.toContain("Tomates");
    expect(texto).toContain("Leche");
  });

  it("una zona entera comprada no deja su encabezado suelto", () => {
    const texto = toPlainText(grupos, new Set(["Tomates"]));
    expect(texto).not.toContain("FRESCO");
  });

  it("con todo comprado no manda nada", () => {
    expect(toPlainText(grupos, new Set(["Tomates", "Leche", "Arroz"]))).toBe("");
  });

  it("sin cantidad no deja un paréntesis vacío", () => {
    const sinCantidad = groupByAisle([{ ...linea("Sal"), amount: "" }]);
    expect(toPlainText(sinCantidad, new Set())).toContain("- Sal");
    expect(toPlainText(sinCantidad, new Set())).not.toContain("()");
  });
});
