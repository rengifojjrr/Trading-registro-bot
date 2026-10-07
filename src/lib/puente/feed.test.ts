import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { baseFalsa, type BaseFalsa } from "./__pruebas__/base-falsa";
import { aplicarUna } from "./aplicar";
import { leerFeed } from "./feed";
import { ENTIDADES } from "./tablas";

/**
 * El feed de cambios: en orden, una foto por fila (la de ahora), sólo con las
 * columnas de la lista, y nunca de otro usuario.
 */

const YO = "aaaaaaaa-0000-4000-8000-0000000000e4";
const OTRO = "bbbbbbbb-0000-4000-8000-0000000000e4";
const PROYECTO = "0192f000-0000-7000-8000-0000000000a1";

let base: BaseFalsa;

beforeEach(() => {
  base = baseFalsa();
  // Como la aplicación (sin el puente): la tarea lleva notas y descripción.
  base.from("tasks_projects").insert({ id: PROYECTO, user_id: YO, name: "Casa de la sierra" }).then(() => {});
  base
    .from("tasks_items")
    .insert({ id: "0192f000-0000-7000-8000-0000000000f1", user_id: YO, project_id: PROYECTO, title: "Mandar los planos", notes: "NOTA-PRIVADA", description: "DESCRIPCION-PRIVADA" })
    .then(() => {});
  base.from("tasks_items").insert({ id: "0192f000-0000-7000-8000-0000000000f9", user_id: OTRO, title: "De otra persona" }).then(() => {});
});

describe("leerFeed", () => {
  it("en orden, sólo lo mío y sólo las columnas de la lista (aunque la base devuelva más)", async () => {
    base.devuelveDeMas = true;
    const pagina = await leerFeed(base as never, YO, 0);
    expect(pagina.cambios.map((c) => c.entidad)).toEqual(["proyecto", "tarea"]);
    const tarea = pagina.cambios[1];
    expect(Object.keys(tarea.fila ?? {})).toEqual([...ENTIDADES.tarea.columnas]);
    expect(JSON.stringify(pagina)).not.toContain("PRIVADA");
    expect(JSON.stringify(pagina)).not.toContain("De otra persona");
    expect(pagina.mas).toBe(false);
    expect(pagina.siguiente).toBe(pagina.cambios[1].seq);
  });

  it("varios cambios de la misma fila: una sola foto, la de ahora", async () => {
    await base.from("tasks_items").update({ title: "Mandar los planos firmados" }).eq("id", "0192f000-0000-7000-8000-0000000000f1");
    await base.from("tasks_items").update({ title: "Mandar los planos firmados ya" }).eq("id", "0192f000-0000-7000-8000-0000000000f1");
    const pagina = await leerFeed(base as never, YO, 0);
    const tareas = pagina.cambios.filter((c) => c.entidad === "tarea");
    expect(tareas).toHaveLength(1);
    expect(tareas[0].fila).toMatchObject({ title: "Mandar los planos firmados ya", version: 3 });
  });

  it("lo borrado sale como borrado, sin foto", async () => {
    await base.from("tasks_items").delete().eq("id", "0192f000-0000-7000-8000-0000000000f1");
    const pagina = await leerFeed(base as never, YO, 0);
    const tarea = pagina.cambios.find((c) => c.entidad === "tarea")!;
    expect(tarea).toMatchObject({ op: "delete", fila: null });
  });

  it("por páginas: el cursor sigue donde quedó y avisa si hay más", async () => {
    const primera = await leerFeed(base as never, YO, 0, 1);
    expect(primera.cambios).toHaveLength(1);
    expect(primera.mas).toBe(true);
    const segunda = await leerFeed(base as never, YO, primera.siguiente, 1);
    expect(segunda.cambios[0].entidad).toBe("tarea");
    const tercera = await leerFeed(base as never, YO, segunda.siguiente, 1);
    expect(tercera).toMatchObject({ cambios: [], siguiente: segunda.siguiente, mas: false });
    expect(tercera.ultimo).toBeGreaterThanOrEqual(segunda.siguiente);
  });

  it("dice quién hizo el cambio por el puente, para no avisar de lo propio", async () => {
    base.por = "mac-1";
    await aplicarUna(
      { admin: base as never, userId: YO, cliente: "mac-1", ahora: new Date("2026-10-06T12:00:00Z"), zona: "UTC" },
      { v: 1, op_id: "0192f000-0000-7000-8000-000000000001", kind: "tarea_hecha", at: "2026-10-06T12:00:00Z", origin: "owner", data: { id: "0192f000-0000-7000-8000-0000000000f1" } },
    );
    const pagina = await leerFeed(base as never, YO, 2);
    expect(pagina.cambios[0]).toMatchObject({ entidad: "tarea", por: "mac-1" });
    expect(pagina.cambios[0].fila).toMatchObject({ status: "HECHA" });
  });

  it("si no se puede leer una tabla, no avanza (mejor repetir que inventar un borrado)", async () => {
    base.ausentes.add("tasks_items");
    await expect(leerFeed(base as never, YO, 0)).rejects.toThrow();
  });
});
