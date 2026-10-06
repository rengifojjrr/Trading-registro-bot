import { describe, expect, it } from "vitest";

import { patronSinTildes, subtituloDePersona } from "./patterns";
import { rankResults, type SearchResult } from "./rank";

describe("buscar sin tildes", () => {
  it("«tomas» y «Tomás» dan el mismo patrón", () => {
    expect(patronSinTildes("tomas")).toBe("t_m_s");
    expect(patronSinTildes("Tomás")).toBe("T_m_s");
    expect(patronSinTildes("Inés García")).toBe("_n_s G_rc__");
  });

  it("con menos de cuatro letras no se toca (sería casi todo comodín)", () => {
    expect(patronSinTildes("ana")).toBe("ana");
    expect(patronSinTildes("ab")).toBe("ab");
  });

  it("el filtro fino encuentra a Tomás, a Inés y a quien tiene un alias", () => {
    const gente: SearchResult[] = [
      { kind: "person", id: "1", title: "Tomás", href: "/personas/1", haystack: "Tomás Tommy contratista" },
      { kind: "person", id: "2", title: "Inés", href: "/personas/2", haystack: "Inés" },
      { kind: "project", id: "3", title: "Finca El Roble", href: "/p/3", haystack: "Finca El Roble finca roble" },
    ];
    expect(rankResults(gente, "tomas").map((r) => r.id)).toEqual(["1"]);
    expect(rankResults(gente, "ines").map((r) => r.id)).toEqual(["2"]);
    expect(rankResults(gente, "tommy").map((r) => r.id)).toEqual(["1"]);
    expect(rankResults(gente, "roble").map((r) => r.id)).toEqual(["3"]);
  });
});

describe("el subtítulo de una persona", () => {
  it("papel y proyecto, para distinguir a dos con el mismo nombre", () => {
    expect(subtituloDePersona(null, [{ role: "Arquitecta", project: "Finca El Roble" }])).toBe("Arquitecta · Finca El Roble");
    expect(subtituloDePersona("Vecina", [{ role: null, project: "Huerto" }])).toBe("Vecina · Huerto");
    expect(subtituloDePersona(null, [{ role: "Socio", project: "A" }, { role: null, project: "B" }])).toBe("Socio · 2 proyectos");
    expect(subtituloDePersona("Amiga", [])).toBe("Amiga");
    expect(subtituloDePersona(null, [])).toBe("Persona");
  });
});
