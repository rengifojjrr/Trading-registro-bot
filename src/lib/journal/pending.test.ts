import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { findPendingJournals, GRACE_HOURS, WINDOW_DAYS, type ClosedTrade } from "./pending";

const ahora = DateTime.fromISO("2026-08-23T12:00:00Z", { zone: "utc" });

const cerrada = (over: Partial<ClosedTrade> & { id: string }): ClosedTrade => ({
  closedAt: ahora.minus({ days: 2 }).toISO() ?? "",
  hasJournal: false,
  ...over,
});

describe("operaciones cerradas sin apuntar", () => {
  it("no molesta con una que acaba de cerrar", () => {
    // Probablemente sigas delante de la pantalla. Avisar ahora es ruido.
    const resultado = findPendingJournals(
      [cerrada({ id: "a", closedAt: ahora.minus({ hours: GRACE_HOURS - 1 }).toISO() ?? "" })],
      ahora,
    );
    expect(resultado.tradeIds).toEqual([]);
  });

  it("avisa pasado el margen", () => {
    const resultado = findPendingJournals(
      [cerrada({ id: "a", closedAt: ahora.minus({ hours: GRACE_HOURS + 1 }).toISO() ?? "" })],
      ahora,
    );
    expect(resultado.tradeIds).toEqual(["a"]);
  });

  it("se olvida de las viejas", () => {
    // Pedirte que recuerdes qué pensabas hace un mes es pedir que te lo
    // inventes, y un aviso imposible de atender enseña a ignorar los demás.
    const resultado = findPendingJournals(
      [cerrada({ id: "a", closedAt: ahora.minus({ days: WINDOW_DAYS + 1 }).toISO() ?? "" })],
      ahora,
    );
    expect(resultado.tradeIds).toEqual([]);
  });

  it("ignora las que ya tienen diario", () => {
    const resultado = findPendingJournals([cerrada({ id: "a", hasJournal: true })], ahora);
    expect(resultado.tradeIds).toEqual([]);
  });

  it("junta todas en un solo aviso y cuenta desde la más antigua", () => {
    const resultado = findPendingJournals(
      [
        cerrada({ id: "nueva", closedAt: ahora.minus({ days: 1 }).toISO() ?? "" }),
        cerrada({ id: "vieja", closedAt: ahora.minus({ days: 5 }).toISO() ?? "" }),
      ],
      ahora,
    );
    expect(resultado.tradeIds).toEqual(["vieja", "nueva"]);
    expect(resultado.message).toContain("2 operaciones");
    expect(resultado.message).toContain("5 días");
  });

  it("habla en singular cuando es una sola", () => {
    const resultado = findPendingJournals(
      [cerrada({ id: "a", closedAt: ahora.minus({ days: 1 }).toISO() ?? "" })],
      ahora,
    );
    expect(resultado.message).toContain("Una operación");
    expect(resultado.message).toContain("1 día");
    expect(resultado.message).not.toContain("1 días");
  });

  it("aguanta una fecha ilegible sin romper el resto", () => {
    const resultado = findPendingJournals(
      [cerrada({ id: "rota", closedAt: "no-es-una-fecha" }), cerrada({ id: "buena" })],
      ahora,
    );
    expect(resultado.tradeIds).toEqual(["buena"]);
  });
});
