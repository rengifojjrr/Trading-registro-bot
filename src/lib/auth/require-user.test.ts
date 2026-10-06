import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `requireUser` también exige el segundo factor.
 *
 * El guardián de rutas ya lo pide, pero cada acción de servidor y cada página
 * pasan por aquí: si algo llegara sin pasar por el guardián, con una sesión
 * aal1 de una cuenta con factor no leería ni escribiría nada.
 */

const estado = vi.hoisted(() => ({
  user: null as { id: string; factors?: { status: string; factor_type: string }[] } | null,
  token: null as string | null,
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: estado.user } }),
      getSession: async () => ({ data: { session: estado.token ? { access_token: estado.token } : null } }),
    },
  }),
}));

import { requireUser } from "./require-user";

function token(aal: string) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ aal })}.x`;
}

beforeEach(() => {
  estado.user = null;
  estado.token = null;
});

describe("requireUser", () => {
  it("sin sesión, a entrar", async () => {
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("con factor y sesión aal1, a pedir el código", async () => {
    estado.user = { id: "u", factors: [{ status: "verified", factor_type: "totp" }] };
    estado.token = token("aal1");
    await expect(requireUser()).rejects.toThrow("REDIRECT:/verificar");
  });

  it("con factor y aal2, pasa", async () => {
    estado.user = { id: "u", factors: [{ status: "verified", factor_type: "totp" }] };
    estado.token = token("aal2");
    await expect(requireUser()).resolves.toMatchObject({ id: "u" });
  });

  it("sin factor, pasa con aal1: nadie se queda fuera", async () => {
    estado.user = { id: "u", factors: [] };
    estado.token = token("aal1");
    await expect(requireUser()).resolves.toMatchObject({ id: "u" });
  });
});
