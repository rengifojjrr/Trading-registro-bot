import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El ciclo del simulador con sesión también pide el segundo factor.
 *
 * Era la única ruta que leía la sesión con `getUser()` a secas: con una sesión
 * aal1 de una cuenta con factor se podía disparar un ciclo y leer su resumen
 * (ids y nombres de bots, mensajes de error).
 */

const estado = vi.hoisted(() => ({
  user: null as { id: string; factors?: { status: string; factor_type: string }[] } | null,
  token: null as string | null,
  ciclos: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
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
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ CRON_SECRET: "secreto-de-prueba-de-al-menos-16" }) }));
vi.mock("@/lib/paper/cron-secret", async () => {
  const real = await vi.importActual<typeof import("@/lib/auth/secreto")>("@/lib/auth/secreto");
  return { coincideSecreto: real.coincideSecreto, secretoDelReloj: async () => null };
});
vi.mock("@/lib/paper/measurement-store", () => ({ medirLoQueFalte: async () => [] }));
vi.mock("@/lib/paper/runner", () => ({
  correrCicloDePapel: async (opciones: unknown) => {
    estado.ciclos.push(opciones);
    return { bots: [{ botId: "b1", nombre: "Bot inventado" }] };
  },
}));

import { POST } from "./route";

function token(aal: string) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ aal })}.x`;
}

const peticion = (cabeceras: Record<string, string> = {}) =>
  new Request("https://app.test/api/paper/tick", { method: "POST", headers: cabeceras });

beforeEach(() => {
  estado.user = null;
  estado.token = null;
  estado.ciclos = [];
});

describe("POST /api/paper/tick", () => {
  it("sin sesión ni secreto, 401", async () => {
    const r = await POST(peticion());
    expect(r.status).toBe(401);
    expect(estado.ciclos).toEqual([]);
  });

  it("con factor y sesión aal1, 401 y ningún ciclo", async () => {
    estado.user = { id: "u", factors: [{ status: "verified", factor_type: "totp" }] };
    estado.token = token("aal1");
    const r = await POST(peticion());
    expect(r.status).toBe(401);
    expect(JSON.stringify(await r.json())).not.toContain("Bot inventado");
    expect(estado.ciclos).toEqual([]);
  });

  it("con factor y aal2, corre sólo lo suyo", async () => {
    estado.user = { id: "u", factors: [{ status: "verified", factor_type: "totp" }] };
    estado.token = token("aal2");
    const r = await POST(peticion());
    expect(r.status).toBe(200);
    expect(estado.ciclos).toEqual([{ userId: "u" }]);
  });

  it("sin factor, con sesión, corre sólo lo suyo", async () => {
    estado.user = { id: "u", factors: [] };
    estado.token = token("aal1");
    const r = await POST(peticion());
    expect(r.status).toBe(200);
    expect(estado.ciclos).toEqual([{ userId: "u" }]);
  });

  it("con el secreto, corre para todos sin mirar la sesión", async () => {
    const r = await POST(peticion({ "x-cron-secret": "secreto-de-prueba-de-al-menos-16" }));
    expect(r.status).toBe(200);
    expect(estado.ciclos).toEqual([{}]);
  });

  it("con un secreto malo, 401", async () => {
    const r = await POST(peticion({ "x-cron-secret": "otro" }));
    expect(r.status).toBe(401);
  });
});
