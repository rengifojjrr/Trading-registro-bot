import { describe, expect, it } from "vitest";

import { fusionar, llevaDatoPrivado, marcaNueva, origenEnLaBase, pareceDatoPrivado } from "./campos";

describe("fusionar: lo que escribió el dueño manda", () => {
  const actual = { title: "Llamar al abogado", due_date: "2026-10-09", assignee_id: null, priority: "MEDIA" };

  it("el bot rellena lo vacío y no toca lo del dueño", () => {
    const r = fusionar("bot", actual, { title: "owner", due_date: "owner" }, {
      title: "Otro título",
      due_date: "2026-10-10",
      assignee_id: "0192f000-0000-7000-8000-000000000001",
    });
    expect(r.parche).toEqual({ assignee_id: "0192f000-0000-7000-8000-000000000001" });
    expect(r.omitidos.sort()).toEqual(["due_date", "title"]);
    expect(r.src.assignee_id).toBe("bot");
    expect(r.src.title).toBe("owner");
  });

  it("un campo sin marca y con valor cuenta como del dueño", () => {
    const r = fusionar("bot", actual, {}, { priority: "ALTA" });
    expect(r.parche).toEqual({});
    expect(r.omitidos).toEqual(["priority"]);
  });

  it("el bot cambia lo que puso él; Claude, lo suyo", () => {
    expect(fusionar("bot", actual, { due_date: "bot" }, { due_date: "2026-10-12" }).parche).toEqual({ due_date: "2026-10-12" });
    expect(fusionar("claude", actual, { due_date: "bot" }, { due_date: "2026-10-12" }).parche).toEqual({});
    expect(fusionar("claude", actual, { due_date: "claude" }, { due_date: "2026-10-12" }).parche).toEqual({ due_date: "2026-10-12" });
  });

  it("el dueño (por WhatsApp o voz) cambia todo y queda como suyo", () => {
    const r = fusionar("owner", actual, { title: "claude" }, { title: "Llamar al abogado el viernes", priority: "ALTA" });
    expect(r.parche).toEqual({ title: "Llamar al abogado el viernes", priority: "ALTA" });
    expect(r.src).toEqual({ title: "owner", priority: "owner" });
  });

  it("lo que no cambia no se escribe ni se marca", () => {
    const r = fusionar("bot", actual, {}, { title: "Llamar al abogado", due_date: undefined });
    expect(r).toEqual({ parche: {}, src: {}, omitidos: [] });
  });
});

describe("marcaNueva", () => {
  it("marca lo que trae, no lo vacío", () => {
    expect(marcaNueva("bot", { title: "x", due_date: null, aliases: [] })).toEqual({ title: "bot" });
  });
});

describe("pareceDatoPrivado", () => {
  it("un jid, siempre", () => {
    expect(pareceDatoPrivado("escribir a 1234@s.whatsapp.net")).toBe(true);
    expect(pareceDatoPrivado("123@lid", { cifras: false })).toBe(true);
    expect(pareceDatoPrivado("grupo 1203630@g.us", { cifras: false })).toBe(true);
  });

  it("un teléfono, aunque venga con espacios o guiones", () => {
    expect(pareceDatoPrivado("Llamar al +58 412 555 1234")).toBe(true);
    expect(pareceDatoPrivado("Llamar al 412-555-1234")).toBe(true);
    expect(pareceDatoPrivado("tel 4125551234")).toBe(true);
  });

  it("no una fecha, una hora ni un número corto", () => {
    expect(pareceDatoPrivado("Mandar los análisis el 15 de octubre a las 10:30")).toBe(false);
    expect(pareceDatoPrivado("Pagar 3 de 7 cuotas")).toBe(false);
    expect(pareceDatoPrivado("Reunión 2026")).toBe(false);
  });
});

describe("llevaDatoPrivado", () => {
  const id = "a0000000-0000-4000-8000-0000000000a1";

  it("los ids, fechas y referencias no cuentan como teléfonos", () => {
    expect(
      llevaDatoPrivado("bot", {
        id,
        proyecto_id: id,
        persona_ids: [id, id],
        titulo: "Mandar los análisis",
        fecha: "2026-10-15",
        fuente: { tipo: "REUNION", ref: "mt:0123456789abcdef:12", en: "2026-10-05T14:00:00Z" },
        ext_id: "mt:0123456789abcdef:12",
      }),
    ).toBe(false);
  });

  it("un teléfono en un título del bot no sube", () => {
    expect(llevaDatoPrivado("bot", { id, titulo: "Llamar a Marta al 4125551234" })).toBe(true);
    expect(llevaDatoPrivado("bot", { id, fuente: { tipo: "MENSAJE", etiqueta: "chat con 4125551234" } })).toBe(true);
  });

  it("un importe en lo que escribe el dueño sí sube; un jid nunca", () => {
    expect(llevaDatoPrivado("owner", { id, titulo: "Pagar 15000000 del anticipo" })).toBe(false);
    expect(llevaDatoPrivado("owner", { id, titulo: "Avisar a 1234@s.whatsapp.net" })).toBe(true);
  });
});

describe("origenEnLaBase", () => {
  it("cada camino, su origen", () => {
    expect(origenEnLaBase("owner")).toBe("WHATSAPP");
    expect(origenEnLaBase("owner", { via: "voz" })).toBe("VOZ");
    expect(origenEnLaBase("claude")).toBe("CLAUDE");
    expect(origenEnLaBase("bot")).toBe("ANALISIS");
    expect(origenEnLaBase("bot", { fuente: { tipo: "REUNION" } })).toBe("REUNION");
    expect(origenEnLaBase("bot", { fuente: { tipo: "LLAMADA" } })).toBe("LLAMADA");
  });
});
