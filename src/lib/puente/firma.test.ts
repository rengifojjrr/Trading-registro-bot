import { describe, expect, it } from "vitest";

import {
  CABECERAS,
  firmaCoincide,
  firmar,
  horaValida,
  leerCabeceras,
  LLAVE_RE,
  textoAFirmar,
  VECTOR_DE_PRUEBA,
} from "./firma";

/**
 * La firma del puente. El vector es el mismo que prueba el bot
 * (`wa-core/test/puente/firma.test.js`): si uno de los dos lados cambia la
 * forma de firmar, falla aquí antes de que el bot deje de poder hablar.
 */

const v = VECTOR_DE_PRUEBA;

describe("firmar", () => {
  it("da la firma del vector compartido con el bot", () => {
    expect(firmar(v.llave, textoAFirmar(v.metodo, v.ruta, v.ts, v.nonce, v.cuerpo))).toBe(v.firma);
  });

  it("cada pieza entra en la firma", () => {
    const base = firmar(v.llave, textoAFirmar(v.metodo, v.ruta, v.ts, v.nonce, v.cuerpo));
    const variantes = [
      textoAFirmar("GET", v.ruta, v.ts, v.nonce, v.cuerpo),
      textoAFirmar(v.metodo, "/api/puente/v1/cambios", v.ts, v.nonce, v.cuerpo),
      textoAFirmar(v.metodo, `${v.ruta}?after=1`, v.ts, v.nonce, v.cuerpo),
      textoAFirmar(v.metodo, v.ruta, v.ts + 1, v.nonce, v.cuerpo),
      textoAFirmar(v.metodo, v.ruta, v.ts, `${v.nonce}x`, v.cuerpo),
      textoAFirmar(v.metodo, v.ruta, v.ts, v.nonce, `${v.cuerpo} `),
    ];
    for (const t of variantes) expect(firmar(v.llave, t)).not.toBe(base);
    expect(firmar(`${v.llave.slice(0, -1)}B`, textoAFirmar(v.metodo, v.ruta, v.ts, v.nonce, v.cuerpo))).not.toBe(base);
  });

  it("el método va en mayúsculas", () => {
    expect(textoAFirmar("post", v.ruta, v.ts, v.nonce, v.cuerpo)).toBe(textoAFirmar("POST", v.ruta, v.ts, v.nonce, v.cuerpo));
  });

  it("la llave del vector tiene la forma de las de verdad", () => {
    expect(LLAVE_RE.test(v.llave)).toBe(true);
  });
});

describe("firmaCoincide", () => {
  it("sí con la misma, no con otra ni con basura", () => {
    expect(firmaCoincide(v.firma, v.firma)).toBe(true);
    expect(firmaCoincide(v.firma, `${v.firma.slice(0, -1)}A`)).toBe(false);
    expect(firmaCoincide("", v.firma)).toBe(false);
    expect(firmaCoincide(`${v.firma}AA`, v.firma)).toBe(false);
    expect(firmaCoincide("no es base64url!", v.firma)).toBe(false);
  });
});

describe("horaValida", () => {
  it("±5 minutos", () => {
    expect(horaValida(1000, 1000)).toBe(true);
    expect(horaValida(1000, 1300)).toBe(true);
    expect(horaValida(1000, 700)).toBe(true);
    expect(horaValida(1000, 1301)).toBe(false);
    expect(horaValida(1000, 699)).toBe(false);
    expect(horaValida(1000.5, 1000)).toBe(false);
  });
});

describe("leerCabeceras", () => {
  const buenas = () =>
    new Headers({
      [CABECERAS.id]: "mac-1",
      [CABECERAS.ts]: String(v.ts),
      [CABECERAS.nonce]: v.nonce,
      [CABECERAS.firma]: v.firma,
    });

  it("las cuatro, bien", () => {
    expect(leerCabeceras(buenas())).toEqual({ cliente: "mac-1", ts: v.ts, nonce: v.nonce, firma: v.firma });
  });

  it("un cliente que no existe, una hora rara o un nonce corto no pasan", () => {
    for (const [cabecera, valor] of [
      [CABECERAS.id, "mac-2"],
      [CABECERAS.id, "MAC-1"],
      [CABECERAS.ts, "12"],
      [CABECERAS.ts, "1791331200.5"],
      [CABECERAS.nonce, "corto"],
      [CABECERAS.nonce, "con espacios dentro de él"],
      [CABECERAS.firma, "x"],
    ] as const) {
      const h = buenas();
      h.set(cabecera, valor);
      expect(leerCabeceras(h), `${cabecera}=${valor}`).toBeNull();
    }
    const sinFirma = buenas();
    sinFirma.delete(CABECERAS.firma);
    expect(leerCabeceras(sinFirma)).toBeNull();
  });
});
