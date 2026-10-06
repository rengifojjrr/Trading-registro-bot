import { describe, expect, it } from "vitest";

import { siguienteSeguro } from "./mfa";
import { rutaInterna } from "./ruta-interna";

/** Lo que haría el navegador con la dirección: ¿a qué origen va? */
function adonde(ruta: string): string {
  return new URL(ruta, "https://trading.app").origin;
}

describe("una ruta de vuelta sólo puede ser de aquí", () => {
  it("deja pasar las rutas normales, con búsqueda y ancla", () => {
    expect(rutaInterna("/tareas/proyectos")).toBe("/tareas/proyectos");
    expect(rutaInterna("/tareas?vista=hoy#arriba")).toBe("/tareas?vista=hoy#arriba");
    expect(rutaInterna("/")).toBe("/");
  });

  it.each([
    "//otra.web/robo",
    "/\\otra.web",
    "/\t/otra.web",
    "/\n/otra.web",
    "/\r/otra.web",
    "/ /otra.web",
    "/\u0000/otra.web",
    "/\u0085/otra.web",
    "/..//otra.web",
    "/a/../..//otra.web",
    "https://otra.web",
    "otra.web",
    "javascript:alert(1)",
    "",
  ])("rechaza %j", (malo) => {
    expect(rutaInterna(malo)).toBe("/");
  });

  it("lo que devuelve nunca lleva a otro origen", () => {
    const casos = ["/\t/otra.web", "/%09/otra.web", "/%2F%2Fotra.web", "/./otra.web", "/..//otra.web", "/tareas"];
    for (const c of casos) expect(adonde(rutaInterna(c))).toBe("https://trading.app");
  });

  it("acepta un valor por defecto y nada que no sea texto", () => {
    expect(rutaInterna(undefined, "/hoy")).toBe("/hoy");
    expect(rutaInterna(42)).toBe("/");
    expect(rutaInterna("x".repeat(3000))).toBe("/");
  });

  it("después del código, tampoco la propia pantalla del código", () => {
    expect(siguienteSeguro("/verificar")).toBe("/");
    expect(siguienteSeguro("/verificar?next=/tareas")).toBe("/");
    expect(siguienteSeguro("/\t/otra.web")).toBe("/");
    expect(siguienteSeguro("/tareas")).toBe("/tareas");
  });

  it("login, la pantalla del código y el enlace del correo usan la misma comprobación", async () => {
    const { readFileSync } = await import("node:fs");
    const leer = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");
    expect(leer("src/app/(auth)/login/actions.ts")).toMatch(/redirect\(rutaInterna\(/);
    expect(leer("src/app/(auth)/login/page.tsx")).toMatch(/rutaInterna\(searchParams\.next\)/);
    expect(leer("src/app/auth/confirm/route.ts")).toMatch(/rutaInterna\(searchParams\.get\("next"\)\)/);
    expect(leer("src/app/(auth)/verificar/page.tsx")).toMatch(/siguienteSeguro\(searchParams\.next\)/);
  });
});
