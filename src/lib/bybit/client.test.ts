import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { cadenaDeConsulta, firmaDeBybit } from "./client";

/**
 * La firma y la cadena de consulta, que se equivocan juntas.
 *
 * Bybit firma el **texto literal** de la query, así que lo firmado y lo enviado
 * tienen que ser idénticos carácter a carácter. Si no lo son, la respuesta habla
 * de la firma y no dice nada del orden de los parámetros, que es lo que en
 * realidad falla -- y perseguir unas credenciales que están bien cuesta una
 * tarde.
 *
 * Aquí no hay red: es el fichero que no puede probarse contra el servicio hasta
 * que existan credenciales, así que lo que se fija es la receta.
 */

describe("la firma", () => {
  const base = {
    timestamp: "1758620000000",
    apiKey: "clave-de-prueba",
    apiSecret: "secreto-de-prueba",
    recvWindow: 10_000,
    query: "category=spot&limit=100&symbol=BTCUSDT",
  };

  /**
   * El orden de los cuatro trozos. Cualquier otro produce un hexadecimal
   * igual de válido que Bybit rechaza.
   */
  it("es timestamp + clave + ventana + query, pegados y en ese orden", () => {
    const esperada = createHmac("sha256", base.apiSecret)
      .update(`${base.timestamp}${base.apiKey}${base.recvWindow}${base.query}`)
      .digest("hex");

    expect(firmaDeBybit(base)).toBe(esperada);
  });

  it("en hexadecimal minúscula", () => {
    expect(firmaDeBybit(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia si cambia cualquiera de los cuatro", () => {
    const suya = firmaDeBybit(base);
    expect(firmaDeBybit({ ...base, timestamp: "1758620000001" })).not.toBe(suya);
    expect(firmaDeBybit({ ...base, apiKey: "otra" })).not.toBe(suya);
    expect(firmaDeBybit({ ...base, recvWindow: 5000 })).not.toBe(suya);
    expect(firmaDeBybit({ ...base, query: "category=linear" })).not.toBe(suya);
    expect(firmaDeBybit({ ...base, apiSecret: "otro" })).not.toBe(suya);
  });

  /**
   * Lo que hace que el orden de la query importe: dos peticiones con los
   * mismos parámetros y distinto orden dan firmas distintas. Por eso la cadena
   * se construye una sola vez y se usa para firmar y para pedir.
   */
  it("una query con los mismos parámetros en otro orden firma distinto", () => {
    const alReves = "symbol=BTCUSDT&limit=100&category=spot";
    expect(firmaDeBybit({ ...base, query: alReves })).not.toBe(firmaDeBybit(base));
  });

  it("una petición sin parámetros firma la cadena vacía, no «undefined»", () => {
    const sinNada = firmaDeBybit({ ...base, query: "" });
    const conLaPalabra = firmaDeBybit({ ...base, query: "undefined" });
    expect(sinNada).not.toBe(conLaPalabra);
  });
});

describe("la cadena de consulta", () => {
  it("sale siempre igual para los mismos parámetros", () => {
    // Ordenada por clave: dos llamadas equivalentes tienen que producir el
    // mismo texto, o una firma no se puede reproducir para depurarla.
    const uno = cadenaDeConsulta({ symbol: "BTCUSDT", category: "spot", limit: 100 });
    const otro = cadenaDeConsulta({ limit: 100, category: "spot", symbol: "BTCUSDT" });
    expect(uno).toBe(otro);
    expect(uno).toBe("category=spot&limit=100&symbol=BTCUSDT");
  });

  it("se salta lo que no se ha puesto", () => {
    // `symbol` sin valor tiene que desaparecer, no viajar como «symbol=».
    // Bybit interpretaría la cadena vacía como un filtro y devolvería cero.
    expect(cadenaDeConsulta({ category: "spot", symbol: undefined })).toBe("category=spot");
    expect(cadenaDeConsulta({ category: "spot", cursor: "" })).toBe("category=spot");
  });

  it("los números van como números", () => {
    expect(cadenaDeConsulta({ startTime: 1758620000000 })).toBe("startTime=1758620000000");
  });

  it("sin nada, cadena vacía", () => {
    expect(cadenaDeConsulta({})).toBe("");
  });
});
