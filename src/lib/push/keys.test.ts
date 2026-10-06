import { generateKeyPairSync } from "node:crypto";

import { importPKCS8 } from "jose";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("sin base en las pruebas");
  },
}));

import { contactoPara, generarPar, pemPrivada, rawPublicKey, vapidKeys } from "./keys";

/**
 * Las claves de los avisos: la forma que piden el navegador y el servicio de
 * push, venga la clave como venga.
 */
describe("la clave pública de los avisos", () => {
  it("el par nuevo sale en la forma del navegador (65 bytes, 0x04) y la privada firma", async () => {
    const par = generarPar();
    const bytes = Buffer.from(par.publica, "base64url");
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
    await expect(importPKCS8(par.privada, "ES256")).resolves.toBeTruthy();
    expect(par.publica).toMatch(/^[A-Za-z0-9_-]{86,88}$/);
  });

  it("la de la receta vieja (SPKI, 91 bytes) se recorta al punto", () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const spki = publicKey.export({ type: "spki", format: "der" });
    const punto = spki.subarray(26).toString("base64url");
    expect(rawPublicKey(spki.toString("base64url"))).toBe(punto);
    expect(rawPublicKey(spki.toString("base64"))).toBe(punto);
    expect(rawPublicKey(punto)).toBe(punto);
  });

  it("lo que no es una clave P-256 no vale", () => {
    expect(rawPublicKey(null)).toBeNull();
    expect(rawPublicKey("")).toBeNull();
    expect(rawPublicKey("hola")).toBeNull();
    expect(rawPublicKey(Buffer.alloc(65, 1).toString("base64url"))).toBeNull();
  });

  it("la privada pegada con \\n escritos vuelve a tener saltos", () => {
    expect(pemPrivada("-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----")).toBe(
      "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----",
    );
  });

  it("el contacto es la propia aplicación por https, o un correo genérico", () => {
    expect(contactoPara("https://app.ejemplo.test")).toBe("https://app.ejemplo.test");
    expect(contactoPara("http://localhost:3000")).toBe("mailto:avisos@example.com");
    expect(contactoPara(null)).toBe("mailto:avisos@example.com");
  });

  it("con las tres variables puestas mandan ellas; sin base, sin claves no hay push", async () => {
    const par = generarPar();
    vi.stubEnv("VAPID_PUBLIC_KEY", par.publica);
    vi.stubEnv("VAPID_PRIVATE_KEY", par.privada.replace(/\n/g, "\\n"));
    vi.stubEnv("VAPID_SUBJECT", "mailto:x@example.com");
    const k = await vapidKeys();
    expect(k?.origen).toBe("entorno");
    expect(k?.privada).toContain("\n");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await vapidKeys()).toBeNull();
    vi.unstubAllEnvs();
  });
});
