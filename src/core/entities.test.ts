import { describe, expect, it } from "vitest";

import { ENTITIES, ENTITY_KINDS } from "./entities";

/**
 * El registro de entidades es lo que hace que la papelera funcione para todos
 * los módulos sin que ninguno la conozca. Cuando una entrada está mal, no falla
 * nada hasta que alguien intenta recuperar algo -- y ese es el peor momento
 * posible para descubrirlo.
 */
describe("registro de entidades", () => {
  it("cada entrada se declara con su propia clave", () => {
    for (const kind of ENTITY_KINDS) {
      expect(ENTITIES[kind].kind, `${kind} tiene un kind que no coincide`).toBe(kind);
    }
  });

  it("nadie se queda sin tabla, título ni color", () => {
    for (const kind of ENTITY_KINDS) {
      const meta = ENTITIES[kind];
      expect(meta.table, `${kind} sin tabla`).toBeTruthy();
      expect(meta.titleColumn, `${kind} sin columna de título`).toBeTruthy();
      expect(meta.colorToken.startsWith("--"), `${kind} sin token de color`).toBe(true);
      expect(meta.detailBase.startsWith("/"), `${kind} sin ruta de ficha`).toBe(true);
    }
  });

  it("dos entidades no comparten tabla", () => {
    // Compartirla haría que restaurar una devolviera filas de la otra.
    const tablas = ENTITY_KINDS.map((k) => ENTITIES[k].table);
    expect(new Set(tablas).size).toBe(tablas.length);
  });

  it("ninguna tabla hija se declara dos veces en la misma entidad", () => {
    // Duplicarla insertaría sus filas dos veces al restaurar.
    for (const kind of ENTITY_KINDS) {
      const hijas = (ENTITIES[kind].children ?? []).map((c) => c.table);
      expect(new Set(hijas).size, `${kind} repite una tabla hija`).toBe(hijas.length);
    }
  });

  it("una tabla hija nunca es la tabla de otra entidad", () => {
    // Sería archivarla dos veces por caminos distintos, y al restaurar la una
    // reaparecerían filas que la otra creía suyas.
    const propias = new Set(ENTITY_KINDS.map((k) => ENTITIES[k].table));
    for (const kind of ENTITY_KINDS) {
      for (const hija of ENTITIES[kind].children ?? []) {
        expect(propias.has(hija.table), `${kind} archiva ${hija.table}, que es de otra entidad`).toBe(
          false,
        );
      }
    }
  });

  it("las columnas generadas conocidas están declaradas", () => {
    // Sin declararlas, restaurar falla con «cannot insert a non-DEFAULT value
    // into column»: el archivo se hace con `select *`, que las trae. Tumbaba la
    // recuperación de una noche de sueño y no se notó porque nadie había
    // recuperado ninguna.
    //
    // Esta lista se comprobó contra la base de datos real (information_schema,
    // is_generated = 'ALWAYS'). Si una migración añade una columna generada,
    // va aquí y en el registro, en el mismo commit.
    expect(ENTITIES.SUENO.generatedColumns).toContain("duration_minutes");
    expect(ENTITIES.OPERACION.generatedColumns).toEqual(
      expect.arrayContaining(["duration_seconds", "total_commissions", "session_effective"]),
    );
  });

  it("una columna generada no puede ser además la del título", () => {
    // Quitarla al restaurar dejaría la fila sin lo que la identifica.
    for (const kind of ENTITY_KINDS) {
      const meta = ENTITIES[kind];
      expect(
        (meta.generatedColumns ?? []).includes(meta.titleColumn),
        `${kind} usa una columna generada como título`,
      ).toBe(false);
    }
  });
});
