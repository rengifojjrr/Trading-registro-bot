import { describe, expect, it } from "vitest";

import { opcionesDe, type PasoChips, type PasoFecha } from "@/core/encuesta/pasos";
import { diaMenos } from "@/core/encuesta/pasos";

import { STATUSES } from "./content";
import { ETIQUETAS_PIEZA, HITOS, hitosDe, pasosDePieza } from "./encuesta";

const HOY = "2026-03-15";

function paso(id: string) {
  return pasosDePieza(HOY).find((p) => p.id === id);
}

describe("el orden de las preguntas", () => {
  it("va del qué al dónde, luego a lo que cuesta, y el guion al final", () => {
    expect(pasosDePieza(HOY).map((p) => p.id)).toEqual([
      "title",
      "status",
      "content_type",
      "channels",
      "platforms",
      "planned_date",
      "summary",
      "hitos",
      "record_difficulties",
      "record_time",
      "edit_time",
      "edit_styles",
      "edit_notes",
      "video_url",
      "final_url",
      "url",
      "notes",
      "body",
    ]);
  });

  /**
   * El guion es lo más valioso del módulo y va el último a propósito: es lo
   * que se viene a escribir con tiempo, y desde la ficha está a un toque.
   */
  it("el guion es la última y tiene sitio para escribir", () => {
    const pasos = pasosDePieza(HOY);
    expect(pasos[pasos.length - 1]).toMatchObject({ id: "body", tipo: "texto" });
  });

  it("todas las respuestas tienen nombre corto para la ficha", () => {
    for (const p of pasosDePieza(HOY)) {
      expect(ETIQUETAS_PIEZA[p.id]).toBeTruthy();
    }
  });
});

describe("los diez estados", () => {
  it("se ofrecen todos, agrupados por el tramo del proceso", () => {
    const estado = paso("status") as PasoChips;
    expect(estado.grupos?.map((g) => g.titulo)).toEqual([
      "Antes de grabar",
      "En edición",
      "Antes de publicar",
      "Fuera",
    ]);
    expect(opcionesDe(estado).map((o) => o.valor)).toEqual([...STATUSES]);
  });

  it("no se puede quedar sin estado: es lo que dice qué falta", () => {
    expect((paso("status") as PasoChips).ninguno).toBeUndefined();
  });
});

describe("los hitos", () => {
  /**
   * Eran tres casillas. Tres preguntas de sí o no seguidas son tres
   * oportunidades de abandonar; una sola con tres fichas se contesta de una
   * pasada.
   */
  it("las tres casillas son una sola pregunta", () => {
    const hitos = paso("hitos") as PasoChips;
    expect(hitos.multiple).toBe(true);
    expect(opcionesDe(hitos).map((o) => o.valor)).toEqual([
      "has_script",
      "is_edited",
      "has_thumbnail_ab",
    ]);
  });

  it("lee de la pieza los que están marcados", () => {
    expect(hitosDe({ has_script: true, is_edited: false, has_thumbnail_ab: true })).toEqual([
      "has_script",
      "has_thumbnail_ab",
    ]);
  });

  it("una pieza recién apuntada no tiene ninguno", () => {
    expect(hitosDe({ has_script: false, is_edited: false, has_thumbnail_ab: false })).toEqual([]);
  });

  it("y se pueden marcar todos", () => {
    expect(hitosDe({ has_script: true, is_edited: true, has_thumbnail_ab: true })).toEqual(
      HITOS.map((h) => h.valor),
    );
  });
});

describe("los tiempos", () => {
  it("se eligen por la etiqueta de Notion, que es como se piensan", () => {
    const grabar = paso("record_time") as PasoChips;
    expect(opcionesDe(grabar).map((o) => o.etiqueta)).toContain("Menos de 1 hora");
  });

  it("editar incluye el «dejé de contar», que es un dato por sí mismo", () => {
    const editar = paso("edit_time") as PasoChips;
    expect(opcionesDe(editar).map((o) => o.valor)).toContain(
      "despues de las 10 deje de contar",
    );
  });
});

describe("la fecha prevista", () => {
  it("va hacia delante: una pieza se planifica, no se retrasa al pasado", () => {
    const prevista = paso("planned_date") as PasoFecha;
    expect((prevista.atajos ?? []).map((a) => [a.etiqueta, diaMenos(HOY, a.dias)])).toEqual([
      ["Hoy", "2026-03-15"],
      ["Mañana", "2026-03-16"],
      ["En una semana", "2026-03-22"],
      ["En un mes", "2026-04-14"],
    ]);
  });
});
