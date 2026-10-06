import { describe, expect, it } from "vitest";

import { coincideSecreto, portadorDe } from "./secreto";

// Secretos de prueba, inventados. Ninguno es de ningún despliegue.
const SECRETO = "secreto-de-prueba-0123456789abcdef";

describe("coincideSecreto", () => {
  it("dice que sí sólo al mismo texto", () => {
    expect(coincideSecreto(SECRETO, SECRETO)).toBe(true);
    expect(coincideSecreto(`${SECRETO}`.slice(0), SECRETO)).toBe(true);
  });

  it("dice que no a un trozo, a uno más largo y a uno que cambia una letra", () => {
    expect(coincideSecreto(SECRETO.slice(0, -1), SECRETO)).toBe(false);
    expect(coincideSecreto(`${SECRETO}x`, SECRETO)).toBe(false);
    expect(coincideSecreto(`X${SECRETO.slice(1)}`, SECRETO)).toBe(false);
    expect(coincideSecreto(SECRETO.toUpperCase(), SECRETO)).toBe(false);
  });

  it("un lado vacío o ausente nunca abre, ni siquiera contra otro vacío", () => {
    expect(coincideSecreto("", "")).toBe(false);
    expect(coincideSecreto(null, null)).toBe(false);
    expect(coincideSecreto(undefined, SECRETO)).toBe(false);
    expect(coincideSecreto(SECRETO, null)).toBe(false);
    expect(coincideSecreto(SECRETO, "")).toBe(false);
  });

  it("no lanza con largos distintos ni con caracteres de varios bytes", () => {
    expect(() => coincideSecreto("a", SECRETO)).not.toThrow();
    expect(coincideSecreto("ñandú-ñandú", "ñandú-ñandú")).toBe(true);
    expect(coincideSecreto("ñandu-ñandú", "ñandú-ñandú")).toBe(false);
  });
});

describe("portadorDe", () => {
  it("saca lo que va detrás de «Bearer », como lo manda Vercel", () => {
    expect(portadorDe(`Bearer ${SECRETO}`)).toBe(SECRETO);
  });

  it("no acepta otra forma de escribirlo", () => {
    expect(portadorDe(null)).toBeNull();
    expect(portadorDe(undefined)).toBeNull();
    expect(portadorDe("")).toBeNull();
    expect(portadorDe("Bearer ")).toBeNull();
    expect(portadorDe(SECRETO)).toBeNull();
    expect(portadorDe(`bearer ${SECRETO}`)).toBeNull();
    expect(portadorDe(`Basic ${SECRETO}`)).toBeNull();
    expect(portadorDe(`Bearer  ${SECRETO}`)).toBe(` ${SECRETO}`);
  });
});
