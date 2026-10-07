import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: "clave-de-servicio-inventada" }) }));

import { LLAVE_RE } from "./firma";
import { derivarLlave, huellaDeLlave, mismaHuella, pimientaDe } from "./llaves";

/**
 * Las llaves se derivan de la clave de servicio: la base guarda la sal y la
 * huella, nunca la llave. La misma sal da la misma llave; otra sal, otro id u
 * otra clave de servicio, otra.
 */
describe("derivarLlave", () => {
  const p = pimientaDe("clave-de-servicio-inventada");
  const id = "0192f000-0000-7000-8000-000000000001";
  const sal = "ab".repeat(24);

  it("tiene la forma de una llave y siempre sale igual", () => {
    const llave = derivarLlave(p, id, sal);
    expect(LLAVE_RE.test(llave)).toBe(true);
    expect(derivarLlave(p, id, sal)).toBe(llave);
  });

  it("otra sal, otro id u otra clave de servicio: otra llave", () => {
    const llave = derivarLlave(p, id, sal);
    expect(derivarLlave(p, id, "cd".repeat(24))).not.toBe(llave);
    expect(derivarLlave(p, "0192f000-0000-7000-8000-000000000002", sal)).not.toBe(llave);
    expect(derivarLlave(pimientaDe("otra-clave-de-servicio"), id, sal)).not.toBe(llave);
  });

  it("la pimienta no es la clave de servicio tal cual", () => {
    expect(p.toString("utf8")).not.toContain("clave-de-servicio");
    expect(p.length).toBe(32);
  });

  it("la huella es la de la llave y se compara sin decir dónde falla", () => {
    const llave = derivarLlave(p, id, sal);
    const huella = huellaDeLlave(llave);
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(mismaHuella(huella, huella)).toBe(true);
    expect(mismaHuella(huella, huellaDeLlave(derivarLlave(p, id, "cd".repeat(24))))).toBe(false);
    expect(mismaHuella(huella, "no-es-una-huella")).toBe(false);
  });
});
