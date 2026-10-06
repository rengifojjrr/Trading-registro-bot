import { describe, expect, it } from "vitest";

import { destinoActivo } from "./bottom-nav";

/** La barra de abajo marca un solo destino, el más concreto. */
describe("qué destino marca la barra de abajo", () => {
  const destinos = [
    { href: "/", label: "Hoy", exact: true },
    { href: "/tareas/proyectos", label: "Proyectos", prefijos: ["/personas", "/tareas/hitos"] },
    { href: "/tareas", label: "Tareas" },
    { href: "/trading", label: "Trading", prefijos: ["/trades"] },
  ] as Parameters<typeof destinoActivo>[0][];

  const marcado = (ruta: string) => destinos.filter((d) => destinoActivo(d, ruta, destinos)).map((d) => d.label);

  it("dentro de un proyecto, Proyectos y no Tareas", () => {
    expect(marcado("/tareas/proyectos/abc")).toEqual(["Proyectos"]);
    expect(marcado("/tareas/hitos/abc")).toEqual(["Proyectos"]);
    expect(marcado("/personas/abc")).toEqual(["Proyectos"]);
  });

  it("las demás pantallas de tareas, Tareas", () => {
    expect(marcado("/tareas")).toEqual(["Tareas"]);
    expect(marcado("/tareas/todas")).toEqual(["Tareas"]);
  });

  it("Hoy sólo en la raíz", () => {
    expect(marcado("/")).toEqual(["Hoy"]);
    expect(marcado("/trades/1")).toEqual(["Trading"]);
    expect(marcado("/comidas")).toEqual([]);
  });
});
