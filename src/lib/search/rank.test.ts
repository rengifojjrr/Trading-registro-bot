import { describe, expect, it } from "vitest";

import {
  KIND_LABELS,
  normalise,
  pageResults,
  rankResults,
  scoreResult,
  type ResultKind,
  type SearchResult,
} from "./rank";

const resultado = (over: Partial<SearchResult> & { title: string }): SearchResult => ({
  kind: "journal",
  id: over.title,
  href: "/journal",
  haystack: over.haystack ?? over.title,
  ...over,
});

describe("normalizar lo buscado", () => {
  it("quita tildes y mayúsculas", () => {
    // Nadie pone tildes buscando, y exigirlas parece roto aunque sea correcto.
    expect(normalise("Análisis del Sueño")).toBe("analisis del sueno");
  });

  it("recorta los espacios de los lados", () => {
    expect(normalise("  hola  ")).toBe("hola");
  });
});

describe("puntuar un resultado", () => {
  it("lo idéntico va por encima de lo que empieza igual, y eso por encima de lo que lo contiene", () => {
    const q = "retroceso";
    expect(scoreResult(resultado({ title: "Retroceso" }), q)).toBeGreaterThan(
      scoreResult(resultado({ title: "Retroceso al 50%" }), q),
    );
    expect(scoreResult(resultado({ title: "Retroceso al 50%" }), q)).toBeGreaterThan(
      scoreResult(resultado({ title: "Esperar el retroceso" }), q),
    );
    expect(scoreResult(resultado({ title: "Esperar el retroceso" }), q)).toBeGreaterThan(
      scoreResult(resultado({ title: "Nota", haystack: "Nota sobre el retroceso" }), q),
    );
  });

  it("encuentra por tilde aunque no se escriba", () => {
    expect(scoreResult(resultado({ title: "Análisis" }), "analisis")).toBeGreaterThan(0);
  });

  it("exige todas las palabras, aunque estén lejos", () => {
    // «retroceso agosto» tiene que encontrar una nota de agosto que hable del
    // retroceso, y no una que solo hable del retroceso.
    const nota = resultado({
      title: "Nota",
      haystack: "En agosto esperé el retroceso y funcionó",
    });
    expect(scoreResult(nota, "retroceso agosto")).toBeGreaterThan(0);
    expect(scoreResult(nota, "retroceso septiembre")).toBe(0);
  });

  it("no puntúa una búsqueda vacía", () => {
    expect(scoreResult(resultado({ title: "Lo que sea" }), "   ")).toBe(0);
  });
});

describe("ordenar los resultados", () => {
  it("descarta lo que no encaja", () => {
    const ordenados = rankResults(
      [resultado({ title: "Retroceso" }), resultado({ title: "Otra cosa" })],
      "retroceso",
    );
    expect(ordenados).toHaveLength(1);
  });

  it("a igual encaje, lo más reciente primero", () => {
    // Si escribiste dos veces sobre lo mismo, buscas la última.
    const ordenados = rankResults(
      [
        resultado({ title: "Retroceso", id: "vieja", when: "2026-01-01" }),
        resultado({ title: "Retroceso", id: "nueva", when: "2026-08-01" }),
      ],
      "retroceso",
    );
    expect(ordenados[0].id).toBe("nueva");
  });

  it("respeta el límite", () => {
    const muchos = Array.from({ length: 50 }, (_, i) =>
      resultado({ title: `Retroceso ${i}`, id: String(i) }),
    );
    expect(rankResults(muchos, "retroceso", 5)).toHaveLength(5);
  });
});

describe("las páginas también se buscan", () => {
  it("encuentra una página por una palabra que no está en su nombre", () => {
    // «drawdown» lleva a Riesgo aunque la página no se llame así -- que es
    // justo cuando un buscador de navegación sirve para algo.
    const ordenados = rankResults(pageResults(), "drawdown");
    expect(ordenados[0].href).toBe("/risk");
  });

  it("encuentra Comportamiento buscando «adherencia»", () => {
    expect(rankResults(pageResults(), "adherencia")[0].href).toBe("/behaviour");
  });

  it("ninguna página se queda sin ser encontrable por su nombre", () => {
    for (const page of pageResults()) {
      expect(rankResults(pageResults(), page.title).map((r) => r.href)).toContain(page.href);
    }
  });
});

describe("el buscador cubre los ocho módulos", () => {
  it("cada tipo de resultado tiene su etiqueta", () => {
    // Un tipo sin etiqueta sale con la columna vacía y no se sabe de qué
    // módulo es, que es justo lo que un buscador global tiene que resolver.
    const tipos: ResultKind[] = [
      "trade",
      "journal",
      "strategy",
      "tag",
      "page",
      "sleep",
      "task",
      "meal",
      "reading",
      "content",
      "habit",
    ];
    for (const tipo of tipos) {
      expect(KIND_LABELS[tipo], `${tipo} sin etiqueta`).toBeTruthy();
    }
  });

  it("las páginas de los siete módulos de vida se pueden encontrar", () => {
    // El buscador solo miraba trading y tareas. «Buscar en todo» que busca en
    // un cuarto de la aplicación enseña que lo que no aparece no está.
    const casos: [string, string][] = [
      ["dormir", "/sueno"],
      ["rutinas", "/habitos"],
      ["alimentación", "/comidas"],
      ["libros", "/lecturas"],
      ["vídeos", "/contenido"],
      ["pendientes", "/tareas"],
    ];
    for (const [texto, href] of casos) {
      expect(rankResults(pageResults(), texto).map((r) => r.href), texto).toContain(href);
    }
  });
});
