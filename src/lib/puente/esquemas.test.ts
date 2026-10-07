import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DATOS_POR_OPERACION, OPERACIONES, validarOperacion } from "./esquemas";

/**
 * La lista cerrada de operaciones. El archivo de ejemplos es el mismo que
 * valida el bot con su copia del esquema: una operación de cada tipo.
 */

const EJEMPLOS = JSON.parse(
  readFileSync(join(process.cwd(), "src/lib/puente/__pruebas__/operaciones-de-ejemplo.json"), "utf8"),
) as { ops: Record<string, unknown>[] };

describe("operaciones de ejemplo", () => {
  it("hay una de cada tipo, ni más ni menos", () => {
    expect(EJEMPLOS.ops.map((o) => o.kind).sort()).toEqual([...OPERACIONES].sort());
    expect(Object.keys(DATOS_POR_OPERACION).sort()).toEqual([...OPERACIONES].sort());
  });

  it.each(EJEMPLOS.ops.map((o) => [o.kind as string, o]))("%s vale", (_kind, op) => {
    const r = validarOperacion(op);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it.each(EJEMPLOS.ops.map((o) => [o.kind as string, o]))("%s no admite un campo de más en los datos", (_kind, op) => {
    const conDeMas = { ...op, data: { ...(op.data as object), intruso: "x" } };
    expect(validarOperacion(conDeMas).ok).toBe(false);
  });
});

describe("el sobre", () => {
  const base = EJEMPLOS.ops[0];

  it("no admite campos de más, otra versión, un tipo desconocido ni un origen inventado", () => {
    for (const malo of [
      { ...base, extra: 1 },
      { ...base, v: 2 },
      { ...base, kind: "borrar_todo" },
      { ...base, origin: "admin" },
      { ...base, op_id: "no-es-un-uuid" },
      { ...base, at: "ayer" },
    ]) {
      expect(validarOperacion(malo).ok, JSON.stringify(malo)).toBe(false);
    }
  });

  it("devuelve el op_id de un sobre roto si lo tiene, para que el bot sepa cuál fue", () => {
    const r = validarOperacion({ ...base, kind: "borrar_todo" });
    expect(r).toEqual({ ok: false, opId: base.op_id, motivo: "forma" });
    const d = validarOperacion({ ...base, data: { id: "x" } });
    expect(d).toEqual({ ok: false, opId: base.op_id, motivo: "datos" });
  });

  it("los topes de largo son los de la base", () => {
    const largo = { ...base, data: { ...(base.data as object), nombre: "x".repeat(61) } };
    expect(validarOperacion(largo).ok).toBe(false);
    const justo = { ...base, data: { ...(base.data as object), nombre: "x".repeat(60) } };
    expect(validarOperacion(justo).ok).toBe(true);
  });

  it("las cifras de WhatsApp son números y sólo los de la lista", () => {
    const metricas = EJEMPLOS.ops.find((o) => o.kind === "metricas_del_dia")!;
    const conTexto = { ...metricas, data: { fecha: "2026-10-06", cifras: { chats_esperando: "tres" } } };
    const conOtra = { ...metricas, data: { fecha: "2026-10-06", cifras: { nombre_de_ana: 1 } } };
    expect(validarOperacion(conTexto).ok).toBe(false);
    expect(validarOperacion(conOtra).ok).toBe(false);
  });

  it("el panel sólo por https y sin consulta", () => {
    const estado = EJEMPLOS.ops.find((o) => o.kind === "agente_estado")!;
    for (const url of ["http://panel.test", "https://panel.test/?k=abc", "https://user@panel.test", "javascript:alert(1)"]) {
      const malo = { ...estado, data: { ...(estado.data as object), panel_url: url } };
      expect(validarOperacion(malo).ok, url).toBe(false);
    }
  });
});
