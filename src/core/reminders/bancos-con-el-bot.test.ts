import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Los dos bancos de frases (recordatorios y orden rápida) son comunes con el
 * bot: el agente guarda una copia EXACTA en `wa-core/test/fixtures/` y sus
 * lectores tienen que pasar los mismos casos. Si el repo del bot está en esta
 * máquina (una carpeta hermana con `wa-core/`, o `BOT_REPO_DIR`), las copias
 * tienen que ser iguales byte a byte. Si no está (CI, otra máquina), se salta.
 */

const RAIZ = process.cwd();
const BANCOS = ["recordatorios-frases.json", "ordenes-frases.json"] as const;

function huella(ruta: string): string {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

/** Las carpetas del bot que hay en esta máquina con alguno de los bancos. */
function reposDelBot(): string[] {
  const candidatos: string[] = [];
  if (process.env.BOT_REPO_DIR) candidatos.push(resolve(process.env.BOT_REPO_DIR));
  const padre = resolve(RAIZ, "..");
  try {
    for (const nombre of readdirSync(padre)) candidatos.push(join(padre, nombre));
  } catch {
    // Sin permiso para listar: sólo cuenta BOT_REPO_DIR.
  }
  return [...new Set(candidatos)].filter((dir) =>
    BANCOS.some((b) => existsSync(join(dir, "wa-core/test/fixtures", b))),
  );
}

const repos = reposDelBot();

describe("los bancos de frases son los mismos que los del bot", () => {
  if (repos.length === 0) it.skip("el bot no está en esta máquina: no hay con qué comparar", () => {});

  for (const dir of repos) {
    for (const banco of BANCOS) {
      const suya = join(dir, "wa-core/test/fixtures", banco);
      it.skipIf(!existsSync(suya))(`${banco} es igual a la copia del bot`, () => {
        expect(
          huella(suya),
          `docs/${banco} y la copia del bot (wa-core/test/fixtures/${banco}) difieren: une los dos y copia el resultado a los dos repos`,
        ).toBe(huella(join(RAIZ, "docs", banco)));
      });
    }
  }
});
