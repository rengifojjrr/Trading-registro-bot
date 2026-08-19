import { describe, expect, it } from "vitest";

import type { CoinbaseFuturesPosition } from "@/lib/coinbase/types";

import { comparePositions, describeMismatch, signedVenueSize } from "./position-check";

function venue(
  product_id: string,
  side: CoinbaseFuturesPosition["side"],
  number_of_contracts: string,
): CoinbaseFuturesPosition {
  return { product_id, side, number_of_contracts };
}

describe("signedVenueSize", () => {
  it("deja el largo en positivo y pone el corto en negativo", () => {
    expect(signedVenueSize(venue("BIP", "LONG", "42"))?.toString()).toBe("42");
    expect(signedVenueSize(venue("BIP", "SHORT", "61"))?.toString()).toBe("-61");
  });

  it("respeta el lado aunque el tamaño venga con signo", () => {
    // El tamaño llega siempre positivo, pero el lado es quien manda.
    expect(signedVenueSize(venue("BIP", "SHORT", "-61"))?.toString()).toBe("-61");
    expect(signedVenueSize(venue("BIP", "LONG", "-42"))?.toString()).toBe("42");
  });

  it("descarta un lado desconocido en lugar de suponerlo", () => {
    // Adivinar el signo de una posición es justo el error que esta
    // comprobación existe para detectar.
    expect(signedVenueSize(venue("BIP", "UNKNOWN", "5"))).toBeNull();
  });

  it("descarta un tamaño ilegible", () => {
    expect(signedVenueSize(venue("BIP", "LONG", "nada"))).toBeNull();
    expect(signedVenueSize(venue("BIP", "LONG", ""))).toBeNull();
  });
});

describe("comparePositions", () => {
  it("no encuentra nada cuando cuadran", () => {
    expect(
      comparePositions([{ productId: "BIP", size: "-61" }], [venue("BIP", "SHORT", "61")]),
    ).toEqual([]);
  });

  it("no encuentra nada cuando los dos están planos", () => {
    expect(comparePositions([], [])).toEqual([]);
    expect(comparePositions([{ productId: "BIP", size: "0" }], [])).toEqual([]);
  });

  it("canta el contrato que sobra en nuestra reconstrucción", () => {
    // El caso real: nuestros fills dicen corto de 1 y Coinbase dice que no
    // hay posición, o sea que falta un fill de compra por explicar.
    expect(comparePositions([{ productId: "BIP", size: "-1" }], [])).toEqual([
      { productId: "BIP", reconstructed: "-1", venue: "0", difference: "1" },
    ]);
  });

  it("canta la posición que Coinbase tiene y nosotros no", () => {
    // Al revés: nos faltan fills de apertura.
    expect(comparePositions([], [venue("BIP", "LONG", "3")])).toEqual([
      { productId: "BIP", reconstructed: "0", venue: "3", difference: "3" },
    ]);
  });

  it("da la diferencia con signo, no en valor absoluto", () => {
    // El signo dice de qué lado falta, que es lo que hace falta para buscarlo.
    const [corto] = comparePositions([{ productId: "BIP", size: "10" }], [venue("BIP", "LONG", "4")]);
    expect(corto.difference).toBe("-6");

    const [largo] = comparePositions([{ productId: "BIP", size: "4" }], [venue("BIP", "LONG", "10")]);
    expect(largo.difference).toBe("6");
  });

  it("suma las filas del mismo producto", () => {
    // Coinbase puede devolver varias por vencimiento; lo comparable es el total.
    expect(
      comparePositions(
        [{ productId: "BIP", size: "5" }],
        [venue("BIP", "LONG", "3"), venue("BIP", "LONG", "2")],
      ),
    ).toEqual([]);
  });

  it("una posición larga y otra corta del mismo producto se compensan", () => {
    expect(
      comparePositions([{ productId: "BIP", size: "0" }], [venue("BIP", "LONG", "4"), venue("BIP", "SHORT", "4")]),
    ).toEqual([]);
  });

  it("compara varios productos y los ordena", () => {
    const mismatches = comparePositions(
      [
        { productId: "ZZZ", size: "1" },
        { productId: "AAA", size: "0" },
      ],
      [venue("AAA", "LONG", "2")],
    );
    expect(mismatches.map((m) => m.productId)).toEqual(["AAA", "ZZZ"]);
  });

  it("ignora una posición de Coinbase con lado desconocido", () => {
    // Sin lado no se puede comparar; inventarlo daría una discrepancia falsa.
    expect(comparePositions([{ productId: "BIP", size: "0" }], [venue("BIP", "UNKNOWN", "5")])).toEqual(
      [],
    );
  });

  it("aguanta decimales sin errores de coma flotante", () => {
    // 0,1 + 0,2 en coma flotante no es 0,3; con Decimal sí.
    expect(
      comparePositions([{ productId: "BIP", size: "0.3" }], [venue("BIP", "LONG", "0.30")]),
    ).toEqual([]);
  });

  it("ignora un tamaño nuestro ilegible en lugar de inventarse una diferencia", () => {
    expect(comparePositions([{ productId: "BIP", size: "nada" }], [])).toEqual([]);
  });
});

describe("describeMismatch", () => {
  it("explica la diferencia en una frase", () => {
    expect(
      describeMismatch({ productId: "BIP", reconstructed: "-1", venue: "0", difference: "1" }),
    ).toBe("BIP: aquí sale corto de 1 contrato y Coinbase dice sin posición.");
  });

  it("usa el plural cuando toca", () => {
    expect(
      describeMismatch({ productId: "BIP", reconstructed: "0", venue: "3", difference: "3" }),
    ).toBe("BIP: aquí sale sin posición y Coinbase dice largo de 3 contratos.");
  });
});
