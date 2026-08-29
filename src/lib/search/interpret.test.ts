import { describe, expect, it } from "vitest";

import { interpret } from "./interpret";

const HOY = "2026-08-29";
const i = (texto: string) => interpret(texto, HOY);

describe("fechas", () => {
  it("entiende hoy, ayer y anteayer", () => {
    expect(i("hoy")).toMatchObject({ kind: "FECHA", date: "2026-08-29" });
    expect(i("ayer")).toMatchObject({ kind: "FECHA", date: "2026-08-28" });
    expect(i("anteayer")).toMatchObject({ kind: "FECHA", date: "2026-08-27" });
  });

  it("cruza el mes hacia atrás", () => {
    expect(interpret("ayer", "2026-09-01")).toMatchObject({ date: "2026-08-31" });
  });

  it("entiende el formato ISO", () => {
    expect(i("2026-08-12")).toMatchObject({ kind: "FECHA", date: "2026-08-12" });
  });

  it("entiende barras, con y sin año", () => {
    // Sin año se supone el de la fecha de referencia: buscando «12/08» en
    // agosto de 2026, nadie quiere el de 2019.
    expect(i("12/08")).toMatchObject({ date: "2026-08-12" });
    expect(i("12/08/2024")).toMatchObject({ date: "2024-08-12" });
    expect(i("12-08-24")).toMatchObject({ date: "2024-08-12" });
  });

  it("entiende el mes escrito", () => {
    expect(i("12 de agosto")).toMatchObject({ date: "2026-08-12" });
    expect(i("12 agosto")).toMatchObject({ date: "2026-08-12" });
    expect(i("3 de enero de 2025")).toMatchObject({ date: "2025-01-03" });
  });

  it("aguanta tildes y abreviaturas del mes", () => {
    expect(i("5 de marzo")).toMatchObject({ date: "2026-03-05" });
    expect(i("5 dic")).toMatchObject({ date: "2026-12-05" });
  });

  it("rechaza fechas que no existen", () => {
    // Un 31 de febrero se desborda a marzo: aceptarlo llevaría a un día que no
    // es el que se escribió.
    expect(i("31/02/2026").kind).toBe("TEXTO");
    expect(i("2026-13-01").kind).toBe("TEXTO");
    expect(i("0/0").kind).toBe("TEXTO");
  });

  it("la fecha gana a la cifra", () => {
    // «12/08/2026» tiene números dentro; sin comprobar la fecha primero se
    // leería como la cifra 12.
    expect(i("12/08/2026").kind).toBe("FECHA");
  });
});

describe("cifras", () => {
  it("entiende un importe con signo", () => {
    expect(i("-500")).toMatchObject({ kind: "CIFRA", amount: -500 });
    expect(i("+500")).toMatchObject({ kind: "CIFRA", amount: 500 });
  });

  it("conserva el signo, que es parte de la búsqueda", () => {
    // «-500» pide pérdidas y «500» cualquiera de las dos: son búsquedas
    // distintas.
    expect(i("-500")).toMatchObject({ amount: -500 });
    expect(i("500")).toMatchObject({ amount: 500 });
  });

  it("entiende el símbolo de moneda y los decimales", () => {
    expect(i("$1.5")).toMatchObject({ kind: "CIFRA", amount: 1.5 });
    expect(i("1.234,5".replace(".", ""))).toMatchObject({ kind: "CIFRA" });
  });

  it("un número pequeño y suelto sigue siendo texto", () => {
    // Secuestrar «5» haría que buscar «top 5» dejara de funcionar.
    expect(i("5").kind).toBe("TEXTO");
    expect(i("99").kind).toBe("TEXTO");
    // Con signo o con símbolo sí es una cifra, aunque sea pequeña.
    expect(i("-5").kind).toBe("CIFRA");
    expect(i("$5").kind).toBe("CIFRA");
  });
});

describe("lo demás sigue siendo texto", () => {
  it("las palabras no se interpretan", () => {
    for (const texto of ["", "  ", "fomo", "BIP-20DEC30", "entré tarde", "agosto"]) {
      expect(interpret(texto, HOY).kind, texto).toBe("TEXTO");
    }
  });
});
