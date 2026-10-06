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

const sesion = vi.hoisted(() => ({
  usuario: null as { id: string; factors?: { status: string; factor_type: string }[] } | null,
  token: null as string | null,
}));

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://proyecto-de-prueba.supabase.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "clave-publicable-de-prueba",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: sesion.usuario } }),
      getSession: async () => ({
        data: { session: sesion.token ? { access_token: sesion.token } : null },
      }),
    },
  }),
}));

import { isPublicPath, updateSession } from "./middleware";

beforeEach(() => {
  sesion.usuario = null;
  sesion.token = null;
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

  it("el reloj de los recordatorios llega a su ruta; sus botones, no", () => {
    // El reloj (pg_cron) llama sin sesión y la ruta exige el secreto de la base.
    expect(isPublicPath("/api/recordatorios/disparar")).toBe(true);
    // «Hecho» y «En 1 h» van con la sesión del teléfono: nunca sin ella.
    expect(isPublicPath("/api/recordatorios/accion")).toBe(false);
    expect(isPublicPath("/api/recordatorios")).toBe(false);
    expect(isPublicPath("/api/recordatorios/disparar-otro")).toBe(false);
    // Si el push está listo, sí o no: público. Lo que enseña cada aviso, no.
    expect(isPublicPath("/api/push/estado")).toBe(true);
    expect(isPublicPath("/api/push/pending")).toBe(false);
    expect(isPublicPath("/api/push/subscribe")).toBe(false);
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
    for (const ruta of ["/api/export/backup", "/tareas", "/api/push/pending", "/api/recordatorios/accion", "/tareas/recordatorios"]) {
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

describe("el segundo factor, una vez inscrito", () => {
  /** Un JWT de mentira: el guardián sólo lee `aal` de uno que getUser ya validó. */
  function token(aal: "aal1" | "aal2") {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({ alg: "HS256" })}.${b64({ sub: "u-1", aal })}.firma`;
  }
  const CON_FACTOR = { id: "u-1", factors: [{ status: "verified", factor_type: "totp" }] };

  const PRIVADAS = ["/", "/tareas/proyectos", "/tareas/proyectos/abc", "/personas", "/trades", "/settings", "/api/push/pending"];

  it("sin aal2 no se ve ninguna ruta privada: todas van a pedir el código", async () => {
    sesion.usuario = CON_FACTOR;
    sesion.token = token("aal1");
    for (const ruta of PRIVADAS) {
      const respuesta = await pide(ruta);
      expect(respuesta.status, ruta).toBe(307);
      const destino = new URL(respuesta.headers.get("location") ?? "");
      expect(destino.pathname, ruta).toBe("/verificar");
      expect(destino.searchParams.get("next"), ruta).toBe(ruta);
    }
  });

  it("con aal2 pasa a todas", async () => {
    sesion.usuario = CON_FACTOR;
    sesion.token = token("aal2");
    for (const ruta of PRIVADAS) {
      const respuesta = await pide(ruta);
      expect(respuesta.headers.get("x-middleware-next"), ruta).toBe("1");
    }
  });

  it("la pantalla del código sí se ve con aal1 (si no, nadie podría escribirlo)", async () => {
    sesion.usuario = CON_FACTOR;
    sesion.token = token("aal1");
    expect((await pide("/verificar")).headers.get("x-middleware-next")).toBe("1");
  });

  it("sin factor inscrito no se pide nada: nadie se queda fuera", async () => {
    sesion.usuario = { id: "u-1", factors: [] };
    sesion.token = token("aal1");
    for (const ruta of PRIVADAS) {
      expect((await pide(ruta)).headers.get("x-middleware-next"), ruta).toBe("1");
    }
  });

  it("un factor a medio inscribir tampoco bloquea", async () => {
    sesion.usuario = { id: "u-1", factors: [{ status: "unverified", factor_type: "totp" }] };
    sesion.token = token("aal1");
    expect((await pide("/tareas/proyectos")).headers.get("x-middleware-next")).toBe("1");
  });

  it("un token que no se entiende cuenta como aal1", async () => {
    sesion.usuario = CON_FACTOR;
    sesion.token = "esto-no-es-un-jwt";
    expect((await pide("/tareas")).status).toBe(307);
  });

  it("los crons y lo público siguen sin pedir nada", async () => {
    sesion.usuario = CON_FACTOR;
    sesion.token = token("aal1");
    expect((await pide("/api/cron/sync")).headers.get("x-middleware-next")).toBe("1");
    expect((await pide("/manifest.webmanifest")).headers.get("x-middleware-next")).toBe("1");
  });
});
