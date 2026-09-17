import { describe, expect, it } from "vitest";

import { opcionesDe, type PasoChips } from "@/core/encuesta/pasos";

import { ETIQUETAS_LECTURA, gruposDeLibros, pasosDeLectura, type LibroElegible } from "./encuesta";

const LIBROS: LibroElegible[] = [
  { id: "a", title: "Meditaciones", author: "Marco Aurelio", icon: "🏛️", status: "LEYENDO" },
  { id: "b", title: "Dune", author: "Herbert", icon: null, status: "POR_LEER" },
  { id: "c", title: "El Quijote", author: null, icon: null, status: "TERMINADO" },
  { id: "d", title: "Ulises", author: "Joyce", icon: null, status: "ABANDONADO" },
];

const HOY = "2026-03-15";

/** La pregunta del libro, que es la única que depende de quién contesta. */
function pasoDelLibro(libros: LibroElegible[]): PasoChips | undefined {
  return pasosDeLectura(libros, HOY).find((p): p is PasoChips => p.id === "book_id");
}

describe("los libros como fichas", () => {
  it("empieza por lo que estás leyendo, que es lo que vas a elegir", () => {
    expect(gruposDeLibros(LIBROS).map((g) => g.titulo)).toEqual([
      "Leyendo",
      "Por leer",
      "Terminado",
      "Abandonado",
    ]);
  });

  it("no deja grupos vacíos: un encabezado sin fichas es ruido", () => {
    const grupos = gruposDeLibros([LIBROS[0]]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].titulo).toBe("Leyendo");
  });

  it("lleva el icono en la etiqueta y el autor en el detalle", () => {
    const [ficha] = gruposDeLibros([LIBROS[0]])[0].opciones;
    expect(ficha).toEqual({ valor: "a", etiqueta: "🏛️ Meditaciones", detalle: "Marco Aurelio" });
  });

  it("un libro sin icono no estrena un espacio delante del título", () => {
    const [ficha] = gruposDeLibros([LIBROS[1]])[0].opciones;
    expect(ficha.etiqueta).toBe("Dune");
  });

  it("ofrece todos los libros, no sólo los que están a medias", () => {
    const paso = pasoDelLibro(LIBROS);
    expect(opcionesDe(paso!).map((o) => o.valor)).toEqual(["a", "b", "c", "d"]);
  });

  it("se puede contestar «nada en concreto»: una lectura suelta también cuenta", () => {
    expect(pasoDelLibro(LIBROS)?.ninguno).toBeTruthy();
  });

  /**
   * Sin libros la pregunta sólo podría contestarse saltándola, y una encuesta
   * que abre con una pregunta imposible es una encuesta que se cierra.
   */
  it("desaparece cuando todavía no hay ningún libro apuntado", () => {
    expect(pasoDelLibro([])).toBeUndefined();
    expect(pasosDeLectura([], HOY).map((p) => p.id)).not.toContain("book_id");
  });
});

describe("el orden de las preguntas", () => {
  it("pone primero lo que alimenta el análisis", () => {
    expect(pasosDeLectura(LIBROS, HOY).map((p) => p.id)).toEqual([
      "book_id",
      "minutes",
      "pages",
      "score",
      "summary",
      "started_at",
      "session_date",
    ]);
  });

  it("deja el día al final: viene contestado y sólo se toca para corregirlo", () => {
    const pasos = pasosDeLectura(LIBROS, HOY);
    expect(pasos[pasos.length - 1].id).toBe("session_date");
  });

  it("el día cuenta desde el hoy de quien contesta, no del servidor", () => {
    const paso = pasosDeLectura(LIBROS, "2026-01-01").find((p) => p.id === "session_date");
    expect(paso).toMatchObject({ tipo: "fecha", hoy: "2026-01-01" });
  });

  it("todas las respuestas tienen nombre corto para el resumen", () => {
    for (const paso of pasosDeLectura(LIBROS, HOY)) {
      expect(ETIQUETAS_LECTURA[paso.id]).toBeTruthy();
    }
  });
});
