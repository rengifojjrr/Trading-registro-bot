import { describe, expect, it } from "vitest";

import { loQueSePierde, nombreDelConector } from "./lo-que-se-pierde";

/**
 * Que un aviso de sincronización caída diga lo que se está jugando.
 *
 * Con Coinbase, cuatro días roto es un fastidio: se arregla, se pide el hueco y
 * aparece todo, porque Coinbase guarda dos años. Con la cuenta demo de Bybit
 * no: **borra a los siete días**, y este diario es su único registro durable.
 * Una sincronización que se rompa un viernes y se arregle el siguiente no
 * recupera la semana -- esas operaciones dejaron de existir en todas partes.
 *
 * Así que el mismo fallo son dos avisos distintos, y el de Bybit tiene que
 * llevar la cuenta atrás. Un aviso que no distingue enseña a ignorarlo, y el
 * día que importe estará igual de ignorado.
 */

const HOY = new Date("2026-09-23T12:00:00Z");

function haceDias(dias: number): string {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

describe("Bybit demo, que borra a los siete días", () => {
  function tras(dias: number) {
    return loQueSePierde({
      connector: "BYBIT_DEMO",
      ultimoExito: haceDias(dias),
      desde: null,
      ahora: HOY,
    });
  }

  it("al principio no mete prisa", () => {
    // Casi siempre se arregla en el ciclo siguiente. Avisar el primer día de
    // que se va a perder todo es la forma de que no se lea el aviso del sexto.
    expect(tras(1).advertencia).toBeNull();
    expect(tras(4).advertencia).toBeNull();
    expect(tras(1).diasHastaPerder).toBe(6);
  });

  it("avisa dos días antes del borrado, y dice cuántos quedan", () => {
    const aviso = tras(5).advertencia;
    expect(aviso).toContain("2 día");
    expect(aviso).toContain("para siempre");
    expect(tras(5).perdiendoYa).toBe(false);
  });

  it("y el día antes también", () => {
    expect(tras(6).advertencia).toContain("1 día");
  });

  it("pasado el plazo cambia de tono: ya no es una advertencia", () => {
    const roto = tras(8);
    expect(roto.perdiendoYa).toBe(true);
    expect(roto.advertencia).toContain("YA SE ESTÁN PERDIENDO");
    // Y dice la verdad incómoda: lo de antes no se recupera arreglándolo.
    expect(roto.advertencia).toContain("no se puede recuperar");
  });

  it("en el día exacto del plazo ya cuenta como perdiendo", () => {
    // Siete días es lo que guarda, así que al séptimo lo más viejo ya cayó.
    expect(tras(7).perdiendoYa).toBe(true);
  });
});

describe("Coinbase, que guarda dos años", () => {
  it("no lleva cuenta atrás ni con la sincronización muy caída", () => {
    const roto = loQueSePierde({
      connector: "COINBASE",
      ultimoExito: haceDias(30),
      desde: null,
      ahora: HOY,
    });

    expect(roto.diasCaida).toBe(30);
    expect(roto.diasHastaPerder).toBeNull();
    expect(roto.perdiendoYa).toBe(false);
    // Treinta días roto sigue siendo grave y el aviso sale igual; lo que no
    // sale es una amenaza de pérdida que no es cierta.
    expect(roto.advertencia).toBeNull();
  });
});

describe("cuando no se sabe desde cuándo", () => {
  it("sin éxito previo, se cuenta desde que la cuenta empezó a intentarlo", () => {
    const sinExito = loQueSePierde({
      connector: "BYBIT_DEMO",
      ultimoExito: null,
      desde: haceDias(6),
      ahora: HOY,
    });
    expect(sinExito.diasCaida).toBe(6);
    expect(sinExito.advertencia).toContain("1 día");
  });

  it("sin nada de lo anterior no se inventa una cuenta atrás", () => {
    // Afirmar «quedan dos días» sin saber desde cuándo sería inventarse la
    // única cifra que hace accionable el aviso.
    const aCiegas = loQueSePierde({
      connector: "BYBIT_DEMO",
      ultimoExito: null,
      desde: null,
      ahora: HOY,
    });
    expect(aCiegas.diasCaida).toBe(0);
    expect(aCiegas.advertencia).toBeNull();
  });

  it("una fecha rota tampoco la inventa", () => {
    const rota = loQueSePierde({
      connector: "BYBIT_DEMO",
      ultimoExito: "no es una fecha",
      desde: null,
      ahora: HOY,
    });
    expect(rota.advertencia).toBeNull();
  });
});

describe("cómo se nombra cada fuente en un aviso", () => {
  it("con su nombre y no con el del conector", () => {
    // El aviso decía «Coinbase» siempre. Desde que hay dos venues, nombrar el
    // equivocado manda a revisar la configuración que está bien.
    expect(nombreDelConector("BYBIT_DEMO")).toBe("Bybit (cuenta demo)");
    expect(nombreDelConector("COINBASE")).toBe("Coinbase");
  });
});
