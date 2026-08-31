// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CalendarHeatmap } from "./calendar-heatmap";

/**
 * A dónde lleva pulsar un día.
 *
 * Es la razón de ser de este test: el calendario llevaba fijo a `/dia/[fecha]`,
 * la ficha de la vida entera, que reparte las operaciones por hora de apertura
 * mientras que aquí se reparten por hora de cierre. Un día con ocho operaciones
 * acababa en «este día no tiene nada registrado». Que el destino lo decida
 * quien usa el calendario es lo que hay que no volver a perder.
 */

const daily = [
  { date: "2026-08-17", netPnl: "152.25", tradesCount: 1 },
  { date: "2026-08-25", netPnl: "-1278.73", tradesCount: 8 },
];

function renderCalendar() {
  return render(
    <CalendarHeatmap
      month="2026-08"
      daily={daily}
      buildMonthHref={(month) => `/trading?month=${month}`}
      buildDayHref={(date) => `/trading/dia/${date}?month=2026-08`}
    />,
  );
}

describe("CalendarHeatmap", () => {
  it("lleva al día de trading, no a la ficha de la vida entera", () => {
    renderCalendar();

    const dia = screen.getByRole("link", { name: /operaciones del 2026-08-25/i });

    expect(dia).toHaveAttribute("href", "/trading/dia/2026-08-25?month=2026-08");
  });

  it("también deja abrir un día sin operaciones", () => {
    renderCalendar();

    // Sin cifra no hay nada que explicar, pero sí a dónde ir: es la forma de
    // llegar a las que se abrieron ese día y cerraron en otro.
    expect(screen.getByRole("link", { name: "Ver el día 2026-08-13" })).toHaveAttribute(
      "href",
      "/trading/dia/2026-08-13?month=2026-08",
    );
  });

  it("los días del mes de al lado no son enlaces", () => {
    renderCalendar();

    // La rejilla empieza el lunes 27 de julio y acaba el domingo 6 de
    // septiembre; ninguno de esos días debe poderse pulsar.
    for (const fuera of ["2026-07-27", "2026-07-31", "2026-09-01", "2026-09-06"]) {
      expect(screen.queryByRole("link", { name: new RegExp(fuera) })).toBeNull();
    }
  });

  it("enseña el mes entero, incluidos los días sin operaciones", () => {
    renderCalendar();

    const dias = screen.getAllByRole("link").filter((el) => {
      const href = el.getAttribute("href") ?? "";
      return href.startsWith("/trading/dia/");
    });

    expect(dias).toHaveLength(31);
  });

  it("las flechas de mes siguen llevando a su mes", () => {
    renderCalendar();

    expect(screen.getByRole("link", { name: "Mes anterior" })).toHaveAttribute(
      "href",
      "/trading?month=2026-07",
    );
    expect(screen.getByRole("link", { name: "Mes siguiente" })).toHaveAttribute(
      "href",
      "/trading?month=2026-09",
    );
  });

  it("el total del mes sólo suma los días de ese mes", () => {
    render(
      <CalendarHeatmap
        month="2026-08"
        daily={[...daily, { date: "2026-09-01", netPnl: "10000", tradesCount: 1 }]}
        buildMonthHref={(month) => `/trading?month=${month}`}
        buildDayHref={(date) => `/trading/dia/${date}`}
      />,
    );

    // 152,25 - 1.278,73 = -1.126,48. El día de septiembre no entra.
    expect(screen.getByText("-$1,126.48")).toBeInTheDocument();
  });
});
