import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Hecho» y «En 1 h» desde la notificación: con la sesión del teléfono, y
 * sólo lo que se valida. Base de mentira.
 */

const estado = vi.hoisted(() => ({
  user: null as { id: string } | null,
  llamadas: [] as { nombre: string; args: Record<string, unknown> }[],
  respuesta: true as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ userForApi: async () => estado.user }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      estado.llamadas.push({ nombre, args });
      return { data: estado.respuesta, error: null };
    },
  }),
}));

import { POST } from "./route";

const ID = "00000000-0000-7000-8000-000000000001";
const llamar = (cuerpo: unknown) =>
  POST(new Request("https://app.test/api/recordatorios/accion", { method: "POST", body: JSON.stringify(cuerpo) }));

beforeEach(() => {
  estado.user = { id: "u" };
  estado.llamadas = [];
  estado.respuesta = true;
});

describe("POST /api/recordatorios/accion", () => {
  it("sin sesión (o sin el segundo factor), 401 y nada", async () => {
    estado.user = null;
    const r = await llamar({ id: ID, fireAt: "2026-10-07T12:00:00.000Z", accion: "hecho" });
    expect(r.status).toBe(401);
    expect(estado.llamadas).toEqual([]);
  });

  it("«Hecho» cierra ese disparo, desde el push", async () => {
    const r = await llamar({ id: ID, fireAt: "2026-10-07T12:00:00.000Z", accion: "hecho" });
    expect(r.status).toBe(200);
    expect(estado.llamadas).toEqual([
      { nombre: "recordatorio_hecho", args: { p_reminder: ID, p_fire_at: "2026-10-07T12:00:00.000Z", p_via: "PUSH" } },
    ]);
  });

  it("«En 1 h» pospone 60 minutos", async () => {
    estado.respuesta = "2026-10-07T13:00:00+00:00";
    const r = await llamar({ id: ID, fireAt: "2026-10-07T12:00:00+00:00", accion: "posponer" });
    expect(r.status).toBe(200);
    expect(estado.llamadas[0]).toEqual({
      nombre: "recordatorio_posponer",
      args: { p_reminder: ID, p_fire_at: "2026-10-07T12:00:00+00:00", p_minutos: 60 },
    });
  });

  it("lo que no se entiende no llega a la base", async () => {
    for (const malo of [
      {},
      { id: "no-es-un-id", fireAt: "2026-10-07T12:00:00Z", accion: "hecho" },
      { id: ID, fireAt: "ayer", accion: "hecho" },
      { id: ID, fireAt: "2026-10-07T12:00:00Z", accion: "borrar" },
      { id: ID, fireAt: "2026-10-07T12:00:00Z", accion: "posponer", minutos: 100000 },
      { id: ID, fireAt: "2026-10-07T12:00:00Z", accion: "hecho", user_id: "otro" },
    ]) {
      const r = await llamar(malo);
      expect(r.status, JSON.stringify(malo)).toBe(400);
    }
    expect(estado.llamadas).toEqual([]);
  });

  it("un recordatorio que no es tuyo (la base dice que no) da 404", async () => {
    estado.respuesta = false;
    const r = await llamar({ id: ID, fireAt: "2026-10-07T12:00:00Z", accion: "hecho" });
    expect(r.status).toBe(404);
  });
});
