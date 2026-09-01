import { describe, expect, it } from "vitest";

import {
  gradeFromTagName,
  isSetupGrade,
  SETUP_GRADES,
  setupTagName,
} from "./setup-grade";

describe("la nota del setup, guardada como etiqueta", () => {
  it("va y vuelve sin perderse", () => {
    for (const grade of SETUP_GRADES) {
      expect(gradeFromTagName(setupTagName(grade)), grade).toBe(grade);
    }
  });

  it("una etiqueta cualquiera no es una nota", () => {
    expect(gradeFromTagName("Ráfaga")).toBeNull();
    expect(gradeFromTagName("Setup")).toBeNull();
    expect(gradeFromTagName("")).toBeNull();
  });

  it("«Setup: » con algo que no es una nota se deja en paz", () => {
    // Es una etiqueta que alguien escribió a mano. Tratarla como nota la
    // borraría en el primer guardado, y nadie sabría por qué desapareció.
    expect(gradeFromTagName("Setup: de libro")).toBeNull();
    expect(gradeFromTagName("Setup: a+")).toBeNull();
  });

  it("distingue una nota de cualquier otro texto", () => {
    expect(isSetupGrade("A+")).toBe(true);
    expect(isSetupGrade("D")).toBe(false);
    expect(isSetupGrade(null)).toBe(false);
    expect(isSetupGrade(4)).toBe(false);
  });

  it("el prefijo es exactamente el que dejó la importación de Notion", () => {
    // Cambiarlo dejaría huérfanas las etiquetas del histórico importado.
    expect(setupTagName("A+")).toBe("Setup: A+");
  });
});
