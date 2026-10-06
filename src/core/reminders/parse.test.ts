import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseReminder, type ParseFailure } from "./parse";

/**
 * El banco común de frases (`docs/recordatorios-frases.json`).
 *
 * Lo leen estas pruebas y las del bot (`reminders/parse.js` del agente, que
 * copia el archivo): si los dos lectores lo pasan, entienden lo mismo. Cada
 * caso compara la salida entera (con los valores por defecto del banco), no
 * sólo lo que el caso nombra: un campo de más también es un fallo.
 */

interface Esperado {
  tipo?: string;
  freq: string;
  hora: string;
  hora_dicha?: boolean;
  dias?: number[];
  dia_mes?: number | null;
  cada_n?: number | null;
  fecha?: string | null;
  hasta?: string | null;
  texto?: string;
  proyecto?: string | null;
  disparador?: boolean;
}

interface Caso {
  frase: string;
  ahora?: string;
  zona?: string;
  espera?: Esperado;
  falla?: ParseFailure;
  nota?: string;
}

interface Banco {
  version: number;
  ahora: string;
  zona: string;
  por_defecto: Omit<Required<Esperado>, "freq" | "hora">;
  casos: Caso[];
}

const banco = JSON.parse(
  readFileSync(join(process.cwd(), "docs/recordatorios-frases.json"), "utf8"),
) as Banco;

function salida(caso: Caso) {
  const r = parseReminder(caso.frase, {
    now: new Date(caso.ahora ?? banco.ahora),
    tz: caso.zona ?? banco.zona,
  });
  if (!r.ok) return { falla: r.reason };
  const v = r.value;
  return {
    espera: {
      tipo: v.kind,
      freq: v.rule.freq,
      hora: v.rule.atTime,
      hora_dicha: v.timeSaid,
      dias: v.rule.days,
      dia_mes: v.rule.monthday,
      cada_n: v.rule.everyN,
      fecha: v.rule.onDate,
      hasta: v.rule.untilDate,
      texto: v.text,
      proyecto: v.project,
      disparador: v.trigger,
    },
  };
}

describe("el banco de frases de recordatorios", () => {
  it("tiene 200 frases o más, sin repetir", () => {
    expect(banco.casos.length).toBeGreaterThanOrEqual(200);
    const claves = banco.casos.map((c) => `${c.frase}|${c.ahora ?? ""}|${c.zona ?? ""}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("cada caso dice lo que espera o por qué falla, nunca las dos cosas", () => {
    for (const c of banco.casos) {
      expect(Boolean(c.espera) !== Boolean(c.falla), c.frase).toBe(true);
    }
  });

  it("cubre lo que el diseño pide", () => {
    const freqs = new Set(banco.casos.map((c) => c.espera?.freq).filter(Boolean));
    expect([...freqs].sort()).toEqual(["CADA_N_DIAS", "DIARIO", "LABORABLES", "MENSUAL", "SEMANAL", "UNA_VEZ"]);
    const tipos = new Set(banco.casos.map((c) => c.espera?.tipo ?? (c.espera ? "TEXTO" : null)).filter(Boolean));
    expect([...tipos].sort()).toEqual(["COMO_VA", "QUE_FALTA", "TEXTO", "TU_DIA"]);
    // Horario de verano, fin de año, el 31 y los bisiestos.
    expect(banco.casos.some((c) => c.ahora?.startsWith("2026-03-08"))).toBe(true);
    expect(banco.casos.some((c) => c.ahora?.startsWith("2026-11-01"))).toBe(true);
    expect(banco.casos.some((c) => c.ahora?.startsWith("2026-12-31"))).toBe(true);
    expect(banco.casos.some((c) => c.espera?.fecha === "2028-02-29")).toBe(true);
    expect(banco.casos.filter((c) => c.falla).length).toBeGreaterThanOrEqual(15);
  });

  it.each(banco.casos.map((c, i) => [i + 1, c.frase, c] as const))("%i · «%s»", (_n, _frase, caso) => {
    const obtenido = salida(caso);
    if (caso.falla) {
      expect(obtenido).toEqual({ falla: caso.falla });
      return;
    }
    expect(obtenido).toEqual({ espera: { ...banco.por_defecto, ...caso.espera } });
  });
});

describe("el lector, fuera del banco", () => {
  const ctx = { now: new Date("2026-10-07T13:20:00-04:00"), tz: "America/New_York" };

  it("no depende de la zona de la máquina: el banco entero da lo mismo con TZ=UTC", () => {
    // El banco se lee con la zona del caso, nunca con la del proceso. Esto lo
    // comprueba de verdad CI, que corre las pruebas también con TZ=UTC; aquí,
    // que ningún campo dependa de `Date#getHours` y compañía.
    const a = parseReminder("recuérdame mañana a las 9 llamar a Ana", ctx);
    const b = parseReminder("recuérdame mañana a las 9 llamar a Ana", { ...ctx, tz: "America/New_York" });
    expect(a).toEqual(b);
  });

  it("una zona que no existe no revienta: se lee en UTC y la base la rechaza al guardar", () => {
    expect(() => parseReminder("recuérdame mañana a las 9 llamar", { ...ctx, tz: "Marte/Olimpo" })).not.toThrow();
  });

  it("el texto nunca pasa de 200", () => {
    const r = parseReminder(`recuérdame mañana ${"a".repeat(500)}`, ctx);
    expect(r.ok && r.value.text.length).toBe(200);
  });

  it("no se cuelga con frases largas o raras", () => {
    const raras = [
      "a las a las a las a las",
      "cada cada cada cada lunes lunes lunes",
      "el el el el 15 15 15 de de de",
      "recuérdame ".repeat(50),
      "mañana ".repeat(80),
      "🛢".repeat(100),
      "1/1/1/1/1/1/1",
    ];
    for (const f of raras) {
      const t0 = Date.now();
      parseReminder(f, ctx);
      expect(Date.now() - t0).toBeLessThan(200);
    }
  });
});
