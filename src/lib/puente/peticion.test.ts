import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta de cada ruta del puente: cabeceras, hora, firma, nonce, límite y
 * tamaño. Con una llave inventada y una base de mentira.
 */

const estado = vi.hoisted(() => ({
  llaves: [] as { id: string; userId: string; llave: string }[],
  base: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("./llaves", () => ({ llavesVivas: async () => estado.llaves }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => estado.base }));

import { NextResponse } from "next/server";

import { resetRateLimits } from "@/lib/rate-limit";

import { baseFalsa, type BaseFalsa } from "./__pruebas__/base-falsa";
import { CABECERAS, firmar, textoAFirmar, VECTOR_DE_PRUEBA } from "./firma";
import { abrirPeticion, CUERPO_MAX_BYTES, LIMITE_POR_IP_MINUTO, LIMITE_POR_MINUTO } from "./peticion";

const LLAVE = VECTOR_DE_PRUEBA.llave;
const YO = "aaaaaaaa-0000-4000-8000-0000000000e4";
const AHORA = 1_791_331_200_000;
let base: BaseFalsa;
let nonce = 0;

function pide({
  cliente = "mac-1",
  metodo = "POST",
  ruta = "/api/puente/v1/ops",
  cuerpo = '{"ops":[]}',
  ts = AHORA / 1000,
  llave = LLAVE,
  firma,
  n = `nonce-de-prueba-${String((nonce += 1)).padStart(4, "0")}`,
  ip,
}: Partial<{ cliente: string; metodo: string; ruta: string; cuerpo: string; ts: number; llave: string; firma: string; n: string; ip: string }> = {}) {
  const f = firma ?? firmar(llave, textoAFirmar(metodo, ruta, ts, n, metodo === "GET" ? "" : cuerpo));
  return new Request(`https://app.test${ruta}`, {
    method: metodo,
    headers: {
      [CABECERAS.id]: cliente,
      [CABECERAS.ts]: String(ts),
      [CABECERAS.nonce]: n,
      [CABECERAS.firma]: f,
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    ...(metodo === "GET" ? {} : { body: cuerpo }),
  });
}

beforeEach(() => {
  resetRateLimits();
  base = baseFalsa();
  estado.base = base;
  estado.llaves = [{ id: "a0000000-0000-4000-8000-0000000e4010", userId: YO, llave: LLAVE }];
});

async function motivo(r: unknown) {
  expect(r).toBeInstanceOf(NextResponse);
  return { status: (r as NextResponse).status, cuerpo: await (r as NextResponse).json() };
}

describe("abrirPeticion", () => {
  it("con la firma buena, abre, devuelve el cuerpo y apunta el latido", async () => {
    const r = await abrirPeticion(pide(), { ahoraMs: AHORA });
    expect(r).toMatchObject({ userId: YO, cliente: "mac-1", cuerpo: '{"ops":[]}' });
    expect(base.tablas.puente_clientes[0]).toMatchObject({ user_id: YO, cliente: "mac-1" });
  });

  it("un GET con consulta firma la consulta", async () => {
    const r = await abrirPeticion(pide({ metodo: "GET", ruta: "/api/puente/v1/cambios?after=10&limit=200" }), { ahoraMs: AHORA });
    expect(r).toMatchObject({ userId: YO });
  });

  it("otra llave, otro cuerpo u otra ruta: firma", async () => {
    const otraLlave = await motivo(await abrirPeticion(pide({ llave: `${LLAVE.slice(0, -1)}B` }), { ahoraMs: AHORA }));
    expect(otraLlave).toEqual({ status: 401, cuerpo: { error: "no_autorizado", motivo: "firma" } });

    const n = "nonce-de-prueba-cambiado";
    const firmaDeOtroCuerpo = firmar(LLAVE, textoAFirmar("POST", "/api/puente/v1/ops", AHORA / 1000, n, '{"ops":[1]}'));
    const cuerpoCambiado = await motivo(await abrirPeticion(pide({ n, firma: firmaDeOtroCuerpo }), { ahoraMs: AHORA }));
    expect(cuerpoCambiado.cuerpo.motivo).toBe("firma");
  });

  it("una llave revocada (ninguna viva) no abre", async () => {
    estado.llaves = [];
    expect((await motivo(await abrirPeticion(pide(), { ahoraMs: AHORA }))).cuerpo.motivo).toBe("firma");
  });

  it("la misma petición dos veces: la segunda es una repetición", async () => {
    const a = await abrirPeticion(pide({ n: "nonce-de-prueba-unico" }), { ahoraMs: AHORA });
    expect(a).not.toBeInstanceOf(NextResponse);
    const b = await motivo(await abrirPeticion(pide({ n: "nonce-de-prueba-unico" }), { ahoraMs: AHORA }));
    expect(b).toEqual({ status: 401, cuerpo: { error: "no_autorizado", motivo: "repetida" } });
  });

  it("fuera de la ventana de 5 minutos: hora, con la del servidor", async () => {
    const r = await motivo(await abrirPeticion(pide({ ts: AHORA / 1000 - 301 }), { ahoraMs: AHORA }));
    expect(r).toEqual({ status: 401, cuerpo: { error: "no_autorizado", motivo: "hora", ahora: AHORA / 1000 } });
  });

  it("sin cabeceras o con un cliente inventado: cabeceras", async () => {
    expect((await motivo(await abrirPeticion(new Request("https://app.test/api/puente/v1/ops", { method: "POST" })))).cuerpo.motivo).toBe("cabeceras");
    expect((await motivo(await abrirPeticion(pide({ cliente: "mac-9" }), { ahoraMs: AHORA }))).cuerpo.motivo).toBe("cabeceras");
  });

  it("demasiado grande: 413 antes de mirar la firma", async () => {
    const r = await motivo(await abrirPeticion(pide({ cuerpo: "x".repeat(CUERPO_MAX_BYTES + 1) }), { ahoraMs: AHORA }));
    expect(r.status).toBe(413);
  });

  it(`más de ${LIMITE_POR_MINUTO} por minuto del mismo cliente, firmadas: 429`, async () => {
    for (let i = 0; i < LIMITE_POR_MINUTO; i += 1) {
      expect(await abrirPeticion(pide({ ip: "198.51.100.7" }), { ahoraMs: AHORA })).not.toBeInstanceOf(NextResponse);
    }
    const r = await motivo(await abrirPeticion(pide({ ip: "198.51.100.7" }), { ahoraMs: AHORA }));
    expect(r.status).toBe(429);
    expect(r.cuerpo.motivo).toBe("limite");
  });

  it(`sin firmar no gastan el cupo del cliente: ${LIMITE_POR_MINUTO + 1} con su nombre desde otra dirección no frenan al bot`, async () => {
    for (let i = 0; i <= LIMITE_POR_MINUTO; i += 1) {
      const r = await motivo(await abrirPeticion(pide({ firma: "A".repeat(43), ip: "203.0.113.9" }), { ahoraMs: AHORA }));
      expect(r.cuerpo.motivo).toBe("firma");
    }
    const bot = await abrirPeticion(pide({ ip: "198.51.100.7" }), { ahoraMs: AHORA });
    expect(bot).not.toBeInstanceOf(NextResponse);
  });

  it(`más de ${LIMITE_POR_IP_MINUTO} por minuto desde la misma dirección, aunque sin firma: 429 antes de mirar las llaves`, async () => {
    for (let i = 0; i < LIMITE_POR_IP_MINUTO; i += 1) {
      await abrirPeticion(pide({ cliente: "vps-1", firma: "A".repeat(43), ip: "203.0.113.9, 10.0.0.1" }), { ahoraMs: AHORA });
    }
    const r = await motivo(await abrirPeticion(pide({ cliente: "vps-1", firma: "A".repeat(43), ip: "203.0.113.9" }), { ahoraMs: AHORA }));
    expect(r.status).toBe(429);
    // Otra dirección sigue entrando.
    expect(await abrirPeticion(pide({ ip: "198.51.100.7" }), { ahoraMs: AHORA })).not.toBeInstanceOf(NextResponse);
  });
});
