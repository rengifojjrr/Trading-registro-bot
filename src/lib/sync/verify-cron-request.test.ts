import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La puerta de los crons.
 *
 * Desde que `/api/cron` pasa el guardián de sesión (un reloj no tiene sesión),
 * esto es lo único que separa esas rutas de cualquiera que las llame. Las
 * pruebas cubren lo que tiene que pasar y lo que no, y que la comparación se
 * hace siempre en tiempo constante -- también cuando el largo no coincide,
 * que es justo el caso en que un `!==` contesta antes.
 */

const entorno = vi.hoisted(() => ({ CRON_SECRET: undefined as string | undefined }));
const comparaciones = vi.hoisted(() => ({ veces: 0 }));

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ CRON_SECRET: entorno.CRON_SECRET }),
}));

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>();
  return {
    ...original,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      comparaciones.veces += 1;
      return original.timingSafeEqual(a, b);
    },
  };
});

import { verifyCronRequest } from "./verify-cron-request";

// Inventado para la prueba.
const SECRETO = "cron-de-prueba-0123456789abcdef";

function peticion(autorizacion?: string): Request {
  const headers = new Headers();
  if (autorizacion !== undefined) headers.set("authorization", autorizacion);
  return new Request("https://app.test/api/cron/sync", { headers });
}

beforeEach(() => {
  entorno.CRON_SECRET = SECRETO;
  comparaciones.veces = 0;
});

describe("verifyCronRequest", () => {
  it("deja pasar el secreto bueno, como lo manda Vercel", () => {
    expect(verifyCronRequest(peticion(`Bearer ${SECRETO}`))).toEqual({ ok: true });
  });

  it("sin cabecera, 401", () => {
    expect(verifyCronRequest(peticion())).toEqual({ ok: false, status: 401 });
  });

  it("con un secreto que no es, 401: un trozo, uno más largo, otra letra", () => {
    for (const malo of [SECRETO.slice(0, -1), `${SECRETO}0`, `x${SECRETO.slice(1)}`, "corto"]) {
      expect(verifyCronRequest(peticion(`Bearer ${malo}`))).toEqual({ ok: false, status: 401 });
    }
  });

  it("con el secreto bueno pero mal presentado, 401", () => {
    for (const cabecera of [SECRETO, `bearer ${SECRETO}`, `Basic ${SECRETO}`, "Bearer "]) {
      expect(verifyCronRequest(peticion(cabecera))).toEqual({ ok: false, status: 401 });
    }
  });

  it("sin CRON_SECRET configurado no abre a nadie (500), ni a quien no manda nada", () => {
    entorno.CRON_SECRET = undefined;
    expect(verifyCronRequest(peticion())).toEqual({ ok: false, status: 500 });
    expect(verifyCronRequest(peticion("Bearer "))).toEqual({ ok: false, status: 500 });
    expect(verifyCronRequest(peticion("Bearer undefined"))).toEqual({ ok: false, status: 500 });
  });

  it("compara en tiempo constante, también cuando el largo no coincide", () => {
    verifyCronRequest(peticion(`Bearer ${SECRETO}`));
    verifyCronRequest(peticion("Bearer corto"));
    verifyCronRequest(peticion(`Bearer ${SECRETO}${SECRETO}`));
    expect(comparaciones.veces).toBe(3);
  });
});
