import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findProjects, parseOrder, type ContextoOrden, type Orden } from "./order-parse";

/**
 * La orden rápida de la web, contra su banco de frases (`docs/ordenes-frases.json`).
 * Proyectos y personas inventados.
 */

interface Banco {
  ahora: string;
  zona: string;
  proyectos: { id: string; name: string; slug: string; aliases: string[] }[];
  personas: { id: string; name: string; aliases: string[]; is_owner: boolean }[];
  miembros: [string, string][];
  casos: {
    frase: string;
    proyecto_por_defecto?: string;
    espera?: Record<string, unknown>;
    falla?: string;
    candidatos?: string[];
  }[];
}

const banco = JSON.parse(readFileSync(join(process.cwd(), "docs/ordenes-frases.json"), "utf8")) as Banco;
const proyectoPorNombre = new Map(banco.proyectos.map((p) => [p.name, p]));
const personaPorId = new Map(banco.personas.map((p) => [p.id, p]));
const personaPorNombre = new Map(banco.personas.map((p) => [p.name, p]));

function contexto(porDefecto?: string): ContextoOrden {
  return {
    now: new Date(banco.ahora),
    tz: banco.zona,
    projects: banco.proyectos,
    people: banco.personas,
    members: banco.miembros.map(([proyecto, persona]) => ({
      projectId: proyectoPorNombre.get(proyecto)!.id,
      personId: personaPorNombre.get(persona)!.id,
    })),
    defaultProjectId: porDefecto ? proyectoPorNombre.get(porDefecto)!.id : null,
  };
}

const nombreDe = (id: string | null) => (id ? (banco.proyectos.find((p) => p.id === id)?.name ?? id) : null);

/** La orden en la forma del banco. */
function enBanco(orden: Orden): Record<string, unknown> {
  switch (orden.tipo) {
    case "TAREA":
      return {
        tipo: "TAREA",
        proyecto: nombreDe(orden.projectId),
        titulo: orden.title,
        persona: orden.personId ? (personaPorId.get(orden.personId)?.name ?? orden.personId) : null,
        fecha: orden.due,
      };
    case "NOTA":
      return { tipo: "NOTA", proyecto: nombreDe(orden.projectId), nota: orden.logKind, texto: orden.text };
    case "ESTADO":
      return {
        tipo: "ESTADO",
        proyecto: nombreDe(orden.projectId),
        estado: orden.status,
        semaforo: orden.health,
        porque: orden.why,
      };
    case "HITO":
      return { tipo: "HITO", proyecto: nombreDe(orden.projectId), titulo: orden.title, fecha: orden.due, precision: orden.precision };
    case "RECORDATORIO":
      return {
        tipo: "RECORDATORIO",
        proyecto: nombreDe(orden.projectId),
        recordatorio: orden.reminder.kind,
        freq: orden.reminder.rule.freq,
        hora: orden.reminder.rule.atTime,
        texto: orden.reminder.text,
      };
  }
}

describe("la orden rápida, contra su banco", () => {
  it("tiene sus casos y cubre las cinco formas", () => {
    expect(banco.casos.length).toBeGreaterThanOrEqual(60);
    const tipos = new Set(banco.casos.map((c) => c.espera?.tipo).filter(Boolean));
    expect([...tipos].sort()).toEqual(["ESTADO", "HITO", "NOTA", "RECORDATORIO", "TAREA"]);
  });

  it.each(banco.casos.map((c, i) => [i + 1, c.frase, c] as const))("%i · «%s»", (_n, _f, caso) => {
    const r = parseOrder(caso.frase, contexto(caso.proyecto_por_defecto));
    if (caso.falla) {
      expect(r.ok, JSON.stringify(r)).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toContain(caso.falla);
        if (caso.candidatos) expect((r.candidatos ?? []).map((c) => c.name)).toEqual(caso.candidatos);
      }
      return;
    }
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) {
      expect(enBanco(r.orden)).toEqual(caso.espera);
      expect(r.entendido.length).toBeGreaterThan(0);
    }
  });
});

describe("«Así lo entendí»", () => {
  it("dice de quién, dónde y cuándo, en palabras", () => {
    const r = parseOrder("en petróleo vz, Marta tiene que mandar el informe para el 20", contexto());
    expect(r.ok && r.entendido).toBe("Tarea de Marta · Petróleo VZ · 20 oct: «Mandar el informe»");
    const t = parseOrder("en petróleo vz agrega llamar al abogado el jueves", contexto());
    expect(t.ok && t.entendido).toBe("Tarea tuya · Petróleo VZ · mañana: «Llamar al abogado»");
    const rec = parseOrder("recuérdame todos los días a las 8 revisar el precio del crudo", contexto());
    expect(rec.ok && rec.entendido).toBe("Recordatorio · Todos los días · 08:00 · «Revisar el precio del crudo» · Petróleo VZ");
  });
});

describe("encontrar el proyecto", () => {
  const ps = banco.proyectos;
  it("por nombre, otro nombre o slug, sin tildes ni mayúsculas", () => {
    expect(findProjects("PETRÓLEO VZ", ps).map((p) => p.name)).toEqual(["Petróleo VZ"]);
    expect(findProjects("crudo", ps).map((p) => p.name)).toEqual(["Petróleo VZ"]);
    expect(findProjects("petroleo-vz", ps).map((p) => p.name)).toEqual(["Petróleo VZ"]);
    expect(findProjects("el proyecto del canal", ps).map((p) => p.name)).toEqual(["Canal"]);
  });

  it("con dos candidatos devuelve los dos, para preguntar", () => {
    expect(findProjects("petróleo", ps).map((p) => p.name)).toEqual(["Petróleo VZ", "Petróleo Colombia"]);
  });

  it("un error de escritura en un nombre largo sí; en uno corto, no (sería adivinar)", () => {
    expect(findProjects("canall", ps)).toEqual([]);
    expect(findProjects("colombai", ps).map((p) => p.name)).toEqual(["Petróleo Colombia"]);
    expect(findProjects("petroleo colombai", ps).map((p) => p.name)).toEqual(["Petróleo Colombia"]);
    expect(findProjects("petrolo vz", ps).map((p) => p.name)).toEqual(["Petróleo VZ"]);
    expect(findProjects("colmbiaa", ps)).toEqual([]);
  });
});
