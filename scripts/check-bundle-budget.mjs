import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Fails the build when the client JavaScript grows past a budget.
 *
 * This app is a private dashboard, not a landing page, so the budget is
 * generous -- the point is not shaving kilobytes, it's catching the class
 * of mistake where a heavy dependency ends up in a client component by
 * accident and quietly doubles what every visit downloads. That change is
 * invisible in a diff and obvious in a byte count.
 *
 * Measures the emitted chunks directly rather than parsing a build
 * manifest, whose name and shape have changed between Next versions.
 *
 * Raise the numbers deliberately when a feature genuinely needs the room;
 * that edit is the review moment this exists to create.
 */
const BUDGETS = {
  /** Everything under .next/static/chunks, uncompressed. */
  totalKb: 4000,
  /** The single largest chunk -- one huge file is the usual shape of an accidental import. */
  largestChunkKb: 1200,
};

const CHUNKS_DIR = ".next/static/chunks";

async function collectChunks(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (entries === null) return null;

  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const nested = await collectChunks(full, rel);
      if (nested) files.push(...nested);
    } else if (entry.name.endsWith(".js")) {
      files.push({ name: rel, kb: (await stat(full)).size / 1024 });
    }
  }
  return files;
}

const chunks = await collectChunks(CHUNKS_DIR);

if (chunks === null) {
  console.error(`No encuentro ${CHUNKS_DIR} — ¿corriste \`npm run build\` antes?`);
  process.exit(1);
}

const totalKb = chunks.reduce((sum, c) => sum + c.kb, 0);
const largest = chunks.sort((a, b) => b.kb - a.kb)[0] ?? { name: "-", kb: 0 };

console.log(`JavaScript de cliente:  ${totalKb.toFixed(0)} kB (presupuesto ${BUDGETS.totalKb} kB)`);
console.log(`Chunk más grande:       ${largest.name} — ${largest.kb.toFixed(0)} kB (presupuesto ${BUDGETS.largestChunkKb} kB)`);
console.log(`Número de chunks:       ${chunks.length}`);

const failures = [];
if (totalKb > BUDGETS.totalKb) {
  failures.push(`El JavaScript de cliente (${totalKb.toFixed(0)} kB) supera el presupuesto de ${BUDGETS.totalKb} kB.`);
}
if (largest.kb > BUDGETS.largestChunkKb) {
  failures.push(
    `El chunk ${largest.name} (${largest.kb.toFixed(0)} kB) supera el presupuesto de ${BUDGETS.largestChunkKb} kB.`,
  );
}

if (failures.length > 0) {
  console.error("\n" + failures.map((f) => `::error::${f}`).join("\n"));
  console.error(
    "\nSi el crecimiento es intencionado, sube el presupuesto en scripts/check-bundle-budget.mjs en el mismo commit.",
  );
  process.exit(1);
}

console.log("\nDentro del presupuesto.");
