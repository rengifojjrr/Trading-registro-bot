import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La ruta a la que llama el reloj de la base. Sin el secreto de `core_reloj`
 * no hace nada; con él, reclama los disparos sin avisar y despierta a cada
 * dueño una vez. Base y push de mentira.
 */

const estado = vi.hoisted(() => ({
  secreto: "s".repeat(64) as string | null,
  usuarios: [] as { user_id: string; n: number }[],
  reclamos: 0,
  pushes: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: tabla === "core_reloj" && estado.secreto ? { secret: estado.secreto } : null }),
        }),
      }),
    }),
    rpc: async (nombre: string) => {
      if (nombre !== "recordatorios_reclamar_push") throw new Error(nombre);
      estado.reclamos += 1;
      return { data: estado.usuarios, error: null };
    },
  }),
}));
vi.mock("@/lib/push/send", () => ({
  sendPushToUser: async (id: string) => {
    estado.pushes.push(id);
    return { sent: 1 };
  },
}));

import { POST } from "./route";

const llamar = (cabeceras: Record<string, string> = {}) =>
  POST(new Request("https://app.test/api/recordatorios/disparar", { method: "POST", headers: cabeceras }));

beforeEach(() => {
  estado.secreto = "s".repeat(64);
  estado.usuarios = [];
  estado.reclamos = 0;
  estado.pushes = [];
});

describe("POST /api/recordatorios/disparar", () => {
  it("sin secreto, 401 y nada", async () => {
    const r = await llamar();
    expect(r.status).toBe(401);
    expect(estado.reclamos).toBe(0);
  });

  it("con un secreto que no es, 401 y nada (también si sólo cambia el final)", async () => {
    for (const malo of ["x".repeat(64), `${"s".repeat(63)}t`, "s".repeat(65), "s"]) {
      const r = await llamar({ "x-reloj-secret": malo });
      expect(r.status, malo).toBe(401);
    }
    expect(estado.reclamos).toBe(0);
  });

  it("sin secreto guardado en la base, nadie entra", async () => {
    estado.secreto = null;
    const r = await llamar({ "x-reloj-secret": "s".repeat(64) });
    expect(r.status).toBe(401);
    expect(estado.reclamos).toBe(0);
  });

  it("con el secreto, un push por dueño con algo que sonar", async () => {
    estado.usuarios = [
      { user_id: "a", n: 2 },
      { user_id: "b", n: 1 },
    ];
    const r = await llamar({ "x-reloj-secret": "s".repeat(64) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, usuarios: 2, enviados: 2 });
    expect(estado.pushes).toEqual(["a", "b"]);
  });

  it("la respuesta no lleva nada de nadie", async () => {
    estado.usuarios = [{ user_id: "aaaaaaaa-0000-4000-8000-000000000001", n: 1 }];
    const r = await llamar({ "x-reloj-secret": "s".repeat(64) });
    expect(JSON.stringify(await r.json())).not.toContain("aaaaaaaa");
  });
});
