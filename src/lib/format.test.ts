import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSessionLabel,
  formatSignedMoney,
  formatSourceLabel,
  pnlColorClass,
  pnlTone,
} from "./format";

/**
 * Las funciones por las que pasa cada número de la aplicación, y que no tenían
 * un solo test.
 *
 * Eso es lo que dejó que `formatDate` escribiera los meses en inglés durante
 * meses: nada comprobaba lo que devolvía. La aplicación entera las usa --las
 * tiles del panel, la tabla de operaciones, el detalle de cada una-- y
 * cambiarlas sin darse cuenta cambia cifras en veinte pantallas a la vez.
 *
 * Lo que se fija aquí no es el aspecto exacto por capricho: es que dos
 * pantallas distintas no puedan enseñar el mismo número de dos maneras.
 */

describe("el dinero", () => {
  it("lleva símbolo y dos decimales", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("acepta la cadena que devuelve un `numeric` de Postgres", () => {
    // Las columnas de dinero llegan como string; pasarlas por `Number` antes
    // sería justo la pérdida de precisión que se evita usándolas así.
    expect(formatMoney("1234.50")).toBe("$1,234.50");
  });

  it("en compacto se queda sin decimales", () => {
    expect(formatMoney(1234.56, { compact: true })).toBe("$1,235");
  });

  it("respeta la moneda de la cuenta", () => {
    expect(formatMoney(1234.5, { currency: "EUR" })).toBe("€1,234.50");
  });

  it("sin valor pone dos rayas y no un cero", () => {
    // Un cero es una respuesta: dice que se midió y salió cero. Cuando no hay
    // dato, decir cero es inventárselo.
    expect(formatMoney(null)).toBe("--");
    expect(formatMoney(undefined)).toBe("--");
  });

  it("con algo que no es un número, tampoco inventa", () => {
    expect(formatMoney(Number.NaN)).toBe("--");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("--");
  });
});

describe("el dinero con signo", () => {
  it("pone el más, que es el que no se pone solo", () => {
    expect(formatSignedMoney(120)).toBe("+$120.00");
  });

  it("pone el menos una vez, no dos", () => {
    expect(formatSignedMoney(-120)).toBe("-$120.00");
  });

  it("el cero no lleva signo", () => {
    // «+$0.00» sugiere que se ganó algo demasiado pequeño para verse.
    expect(formatSignedMoney(0)).toBe("$0.00");
  });
});

describe("los porcentajes", () => {
  it("llevan el signo delante", () => {
    expect(formatPercent(7.192)).toBe("+7.19%");
    expect(formatPercent(-7.192)).toBe("-7.19%");
  });

  it("se les puede pedir menos decimales", () => {
    expect(formatPercent(7.192, 1)).toBe("+7.2%");
  });

  it("sin valor, dos rayas", () => {
    expect(formatPercent(null)).toBe("--");
  });
});

describe("las cantidades", () => {
  it("llevan separador de miles", () => {
    expect(formatNumber(35787)).toBe("35,787");
  });

  it("no rellenan decimales que no hay", () => {
    expect(formatNumber(18)).toBe("18");
    expect(formatNumber(0.5)).toBe("0.5");
  });
});

describe("las duraciones", () => {
  it("menos de un minuto van en segundos", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("de minutos a horas", () => {
    expect(formatDuration(12 * 60)).toBe("12m");
    expect(formatDuration(2 * 3600 + 15 * 60)).toBe("2h 15m");
  });

  it("a partir de un día se dejan los minutos", () => {
    // Que una operación durara tres días y cuatro horas es lo que importa; los
    // minutos ahí son ruido.
    expect(formatDuration(3 * 86400 + 4 * 3600 + 7 * 60)).toBe("3d 4h");
  });

  it("cero es cero segundos, no dos rayas", () => {
    // Una operación de duración cero existe --se abrió y se cerró en la misma
    // vela--, así que aquí el cero es un dato y no una ausencia.
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(null)).toBe("--");
  });
});

describe("las fechas", () => {
  /**
   * El fallo que motivó este fichero. `formatDate` no ponía idioma, luxon
   * usaba el de la máquina --`en-US` en el servidor-- y la aplicación escribía
   * «Jan», «Apr», «Aug», «Dec». Ahora el idioma viene puesto de `@/lib/fecha`.
   */
  it("escriben el mes en español", () => {
    expect(formatDate("2026-01-03T10:00:00Z")).toBe("03 ene 2026");
    expect(formatDate("2026-08-03T10:00:00Z")).toBe("03 ago 2026");
    expect(formatDate("2026-12-03T10:00:00Z")).toBe("03 dic 2026");
  });

  it("con hora, también", () => {
    expect(formatDateTime("2026-04-03T10:30:00Z")).toBe("03 abr 2026, 10:30");
  });

  it("se mueven a la zona del usuario", () => {
    // Las 22:30 UTC son las 17:30 en Nueva York, y del día anterior en el caso
    // límite -- que es justo por lo que una fecha nunca se formatea sin zona.
    expect(formatDateTime("2026-04-03T02:30:00Z", "America/New_York")).toBe("02 abr 2026, 22:30");
  });

  it("sin fecha o con una rota, dos rayas", () => {
    expect(formatDate(null)).toBe("--");
    expect(formatDate("no es una fecha")).toBe("--");
    expect(formatDateTime(undefined)).toBe("--");
  });
});

describe("el color de un resultado", () => {
  it("sale del signo", () => {
    expect(pnlTone(1)).toBe("positive");
    expect(pnlTone(-1)).toBe("negative");
  });

  it("el cero es neutro, y la ausencia también", () => {
    expect(pnlTone(0)).toBe("neutral");
    expect(pnlTone(null)).toBe("neutral");
  });

  it("la clase de CSS va con el tono", () => {
    expect(pnlColorClass("12.5")).toBe("text-positive");
    expect(pnlColorClass("-12.5")).toBe("text-negative");
    expect(pnlColorClass(null)).toBe("text-foreground");
  });
});

describe("las etiquetas", () => {
  it("las sesiones van en español", () => {
    expect(formatSessionLabel("NEW_YORK")).toBe("Nueva York");
    expect(formatSessionLabel("LONDON_NEW_YORK_OVERLAP")).toBe("Londres / Nueva York");
    expect(formatSessionLabel(null)).toBe("--");
  });

  it("y el origen de una operación", () => {
    expect(formatSourceLabel("COINBASE_SYNC")).toBe("Coinbase");
    expect(formatSourceLabel(null)).toBe("--");
  });
});
