import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El guardián de sesión y los relojes.
 *
 * Vercel Cron llama sin sesión. Mientras `/api/cron` no estuvo en la lista de
 * lo público, el guardián le contestaba con un 307 a /login antes de que la
 * ruta mirase el secreto, y un cron que recibe un 307 da la llamada por buena:
 * la conciliación de cada noche, la purga de la papelera y el respaldo
 * programado no corrieron nunca.
 *
 * Estas pruebas fijan las dos mitades del arreglo: el guardián deja llegar a
 * los crons, y cada ruta de crons empieza exigiendo su secreto (si alguien
 * añade una sin `verifyCronRequest`, quedaría abierta a internet).
 */

const sesion = vi.hoisted(() => ({ usuario: null as { id: string } | null }));

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://proyecto-de-prueba.supabase.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "clave-publicable-de-prueba",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: sesion.usuario } }) },
  }),
}));

import { isPublicPath, updateSession } from "./middleware";

beforeEach(() => {
  sesion.usuario = null;
});

function pide(ruta: string, cabeceras: Record<string, string> = {}) {
  return updateSession(new NextRequest(`https://app.test${ruta}`, { headers: cabeceras }));
}

describe("lo que el guardián deja pasar sin sesión", () => {
  it("los crons, con o sin subruta", () => {
    for (const ruta of ["/api/cron", "/api/cron/sync", "/api/cron/reconcile", "/api/cron/backup", "/api/cron/notion-sync"]) {
      expect(isPublicPath(ruta), ruta).toBe(true);
    }
  });

  it("no lo que sólo empieza parecido", () => {
    expect(isPublicPath("/api/cronos")).toBe(false);
    expect(isPublicPath("/api/cron-falso/sync")).toBe(false);
  });

  it("la descarga del respaldo sigue detrás de la sesión: es el botón de Ajustes", () => {
    expect(isPublicPath("/api/export/backup")).toBe(false);
    expect(isPublicPath("/api/export/trades")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });
});

describe("updateSession sin sesión", () => {
  it("deja llegar a /api/cron/sync a la ruta, que es quien mira el secreto", async () => {
    const respuesta = await pide("/api/cron/sync", { authorization: "Bearer lo-que-sea" });
    expect(respuesta.status).not.toBe(307);
    expect(respuesta.headers.get("location")).toBeNull();
    expect(respuesta.headers.get("x-middleware-next")).toBe("1");
  });

  it("y también sin cabecera: el 401 lo da la ruta, no un 307 a /login", async () => {
    const respuesta = await pide("/api/cron/reconcile");
    expect(respuesta.headers.get("x-middleware-next")).toBe("1");
  });

  it("lo demás sigue yendo a /login", async () => {
    for (const ruta of ["/api/export/backup", "/tareas", "/api/push/pending"]) {
      const respuesta = await pide(ruta);
      expect(respuesta.status, ruta).toBe(307);
      expect(new URL(respuesta.headers.get("location") ?? "").pathname, ruta).toBe("/login");
    }
  });
});

describe("cada ruta de /api/cron exige su secreto antes de nada", () => {
  const DIRECTORIO = join(process.cwd(), "src/app/api/cron");

  function rutas(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      const camino = join(dir, nombre);
      if (statSync(camino).isDirectory()) return rutas(camino);
      return nombre === "route.ts" ? [camino] : [];
    });
  }

  const ficheros = rutas(DIRECTORIO);

  it("hay rutas que vigilar", () => {
    expect(ficheros.length).toBeGreaterThanOrEqual(4);
  });

  it.each(ficheros.map((f) => [f.slice(DIRECTORIO.length + 1), f]))(
    "%s llama a verifyCronRequest al principio de cada método",
    (_nombre, fichero) => {
      const codigo = readFileSync(fichero, "utf8");
      const metodos = [
        ...codigo.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*{([\s\S]*?)\n}/g),
      ];
      expect(metodos.length).toBeGreaterThan(0);
      for (const [, metodo, cuerpo] of metodos) {
        const primeras = cuerpo.trim().split("\n").slice(0, 4).join("\n");
        expect(primeras, metodo).toMatch(/const auth = verifyCronRequest\(request\);\s*if \(!auth\.ok\) {/);
      }
    },
  );
});
