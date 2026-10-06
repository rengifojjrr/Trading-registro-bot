import { describe, expect, it } from "vitest";

import { aalDeToken, necesitaCodigo, siguienteSeguro, tieneFactorVerificado } from "./mfa";

/** Un JWT de mentira (sin firma de verdad): sólo importa su contenido. */
function token(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(payload)}.firma`;
}

const CON_FACTOR = { factors: [{ status: "verified", factor_type: "totp" }] };
const A_MEDIAS = { factors: [{ status: "unverified", factor_type: "totp" }] };
const SIN_FACTOR = { factors: [] };

describe("el segundo factor", () => {
  it("lee el nivel del token", () => {
    expect(aalDeToken(token({ aal: "aal2" }))).toBe("aal2");
    expect(aalDeToken(token({ aal: "aal1" }))).toBe("aal1");
    expect(aalDeToken(token({}))).toBe("aal1");
    expect(aalDeToken("basura")).toBe("aal1");
    expect(aalDeToken("a.@@@.c")).toBe("aal1");
    expect(aalDeToken(null)).toBeNull();
  });

  it("sólo cuenta un factor verificado", () => {
    expect(tieneFactorVerificado(CON_FACTOR)).toBe(true);
    expect(tieneFactorVerificado(A_MEDIAS)).toBe(false);
    expect(tieneFactorVerificado(SIN_FACTOR)).toBe(false);
    expect(tieneFactorVerificado(null)).toBe(false);
  });

  it("sin factor nunca pide código: nadie se queda fuera", () => {
    expect(necesitaCodigo(SIN_FACTOR, "aal1")).toBe(false);
    expect(necesitaCodigo(A_MEDIAS, "aal1")).toBe(false);
    expect(necesitaCodigo(SIN_FACTOR, null)).toBe(false);
  });

  it("con factor, pide el código hasta que la sesión está en aal2", () => {
    expect(necesitaCodigo(CON_FACTOR, "aal1")).toBe(true);
    expect(necesitaCodigo(CON_FACTOR, null)).toBe(true);
    expect(necesitaCodigo(CON_FACTOR, "aal2")).toBe(false);
  });

  it("después del código sólo se vuelve a una ruta de aquí", () => {
    expect(siguienteSeguro("/tareas/proyectos")).toBe("/tareas/proyectos");
    expect(siguienteSeguro("//otra.web/robo")).toBe("/");
    expect(siguienteSeguro("/\\otra.web")).toBe("/");
    expect(siguienteSeguro("https://otra.web")).toBe("/");
    expect(siguienteSeguro("/verificar")).toBe("/");
    expect(siguienteSeguro(undefined)).toBe("/");
  });
});
