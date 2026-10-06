import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ningún flujo de GitHub imprime lo que contesta la aplicación.
 *
 * El repositorio es público y los registros de Actions también. La respuesta
 * de los crons y del simulador lleva ids de cuentas, nombres de bots, rutas de
 * respaldo y mensajes de error de los proveedores: en el registro sólo puede
 * ir el código HTTP. Cada `curl` que llama a `$APP_URL` tiene que mandar el
 * cuerpo a un fichero (`-o`) y no usar `--fail-with-body`, que lo imprime.
 */

const DIR = join(process.cwd(), ".github/workflows");

/** Cada llamada a curl, con sus líneas de continuación juntas. */
function llamadas(texto: string): string[] {
  const juntas = texto.replace(/\\\n\s*/g, " ");
  return juntas.split("\n").filter((l) => /(^|[\s$(])curl\s+-/.test(l) && !/^\s*#/.test(l));
}

describe("los flujos no imprimen respuestas de la aplicación", () => {
  const ficheros = readdirSync(DIR).filter((f) => f.endsWith(".yml"));
  const deLaApp = ficheros.flatMap((f) =>
    llamadas(readFileSync(join(DIR, f), "utf8"))
      .filter((l) => l.includes("APP_URL"))
      .map((l) => [f, l] as const),
  );

  it("hay llamadas que vigilar", () => {
    expect(deLaApp.length).toBeGreaterThanOrEqual(4);
  });

  it.each(deLaApp)("%s: %s", (_f, linea) => {
    expect(linea).toMatch(/\s-o\s+\S+/);
    expect(linea).not.toMatch(/--fail-with-body/);
  });
});
