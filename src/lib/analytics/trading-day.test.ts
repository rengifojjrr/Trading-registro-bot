import { describe, expect, it } from "vitest";

import {
  countOutcomes,
  splitTradingDay,
  sumNetPnl,
  tradingDayWindow,
} from "./trading-day";

describe("tradingDayWindow", () => {
  it("usa la medianoche del usuario, no la del servidor", () => {
    const { from, to } = tradingDayWindow("2026-08-25", "America/Bogota");

    // Bogotá va a UTC-5 todo el año: el día empieza a las 05:00 UTC.
    expect(from).toBe("2026-08-25T05:00:00.000Z");
    expect(to).toBe("2026-08-26T04:59:59.999Z");
  });

  it("respeta el horario de verano de la zona", () => {
    // Madrid en agosto va a UTC+2; en enero, a UTC+1. Un desfase fijo daría
    // una hora de más o de menos en medio año del historial.
    expect(tradingDayWindow("2026-08-25", "Europe/Madrid").from).toBe("2026-08-24T22:00:00.000Z");
    expect(tradingDayWindow("2026-01-25", "Europe/Madrid").from).toBe("2026-01-24T23:00:00.000Z");
  });

  it("cae en UTC si la zona no existe, en vez de romper la página", () => {
    expect(tradingDayWindow("2026-08-25", "Marte/Olympus").from).toBe("2026-08-25T00:00:00.000Z");
  });
});

describe("splitTradingDay", () => {
  const window = tradingDayWindow("2026-08-25", "UTC");

  it("cuenta una operación por su cierre, no por su apertura", () => {
    const cruzaMedianoche = {
      opened_at: "2026-08-24T22:00:00+00:00",
      closed_at: "2026-08-25T03:00:00+00:00",
    };

    const split = splitTradingDay([cruzaMedianoche], window);

    expect(split.closed).toEqual([cruzaMedianoche]);
    expect(split.opened).toEqual([]);
  });

  it("separa las que se abrieron ese día pero cerraron después", () => {
    const arrastrada = {
      opened_at: "2026-08-25T10:00:00+00:00",
      closed_at: "2026-08-27T10:00:00+00:00",
    };

    const split = splitTradingDay([arrastrada], window);

    expect(split.closed).toEqual([]);
    expect(split.opened).toEqual([arrastrada]);
  });

  it("incluye las que siguen abiertas", () => {
    const abierta = { opened_at: "2026-08-25T10:00:00+00:00", closed_at: null };

    expect(splitTradingDay([abierta], window).opened).toEqual([abierta]);
  });

  it("no repite la que se abre y se cierra el mismo día", () => {
    const intradía = {
      opened_at: "2026-08-25T09:00:00+00:00",
      closed_at: "2026-08-25T11:00:00+00:00",
    };

    const split = splitTradingDay([intradía], window);

    expect(split.closed).toEqual([intradía]);
    expect(split.opened).toEqual([]);
  });

  it("deja fuera lo que no toca el día", () => {
    const otroDía = {
      opened_at: "2026-08-20T09:00:00+00:00",
      closed_at: "2026-08-20T11:00:00+00:00",
    };

    const split = splitTradingDay([otroDía], window);

    expect(split.closed).toEqual([]);
    expect(split.opened).toEqual([]);
  });

  it("compara instantes y no texto, aunque cambie el formato de la fecha", () => {
    // Postgres devuelve `+00:00`; la ventana se calcula con `Z`. Como cadenas,
    // "2026-08-25T23:59:59+00:00" > "2026-08-25T23:59:59.999Z".
    const alFilo = {
      opened_at: "2026-08-25T23:00:00+00:00",
      closed_at: "2026-08-25T23:59:59+00:00",
    };

    expect(splitTradingDay([alFilo], window).closed).toEqual([alFilo]);
  });

  it("ordena las cerradas por hora de cierre", () => {
    const tarde = { opened_at: "2026-08-25T08:00:00Z", closed_at: "2026-08-25T18:00:00Z" };
    const pronto = { opened_at: "2026-08-25T09:00:00Z", closed_at: "2026-08-25T10:00:00Z" };

    expect(splitTradingDay([tarde, pronto], window).closed).toEqual([pronto, tarde]);
  });

  it("con la zona del usuario mete en el día lo que UTC dejaría fuera", () => {
    const bogota = tradingDayWindow("2026-08-25", "America/Bogota");
    // 20:00 del lunes en Bogotá son las 01:00 del martes en UTC.
    const nocheDelLunes = {
      opened_at: "2026-08-25T23:30:00+00:00",
      closed_at: "2026-08-26T01:00:00+00:00",
    };

    expect(splitTradingDay([nocheDelLunes], bogota).closed).toEqual([nocheDelLunes]);
    expect(splitTradingDay([nocheDelLunes], window).closed).toEqual([]);
  });
});

describe("sumNetPnl", () => {
  it("suma sin el error de coma flotante", () => {
    expect(sumNetPnl([{ net_pnl: "0.1" }, { net_pnl: "0.2" }])).toBe("0.3");
  });

  it("trata la operación sin P&L como cero, no como NaN", () => {
    expect(sumNetPnl([{ net_pnl: "100" }, { net_pnl: null }])).toBe("100");
  });

  it("sin operaciones es cero", () => {
    expect(sumNetPnl([])).toBe("0");
  });

  it("reproduce el total de una celda del calendario", () => {
    // El 25 de agosto de la captura: ocho operaciones, -$1.279.
    const dia = ["-820.5", "-300.25", "-158.25", "120", "-90", "-40.5", "10.25", "0.25"].map(
      (net_pnl) => ({ net_pnl }),
    );

    expect(sumNetPnl(dia)).toBe("-1279");
  });
});

describe("countOutcomes", () => {
  it("las de punto de equilibrio no cuentan como ganadas", () => {
    const rows = [{ net_pnl: "10" }, { net_pnl: "-5" }, { net_pnl: "0" }, { net_pnl: null }];

    expect(countOutcomes(rows)).toEqual({ wins: 1, losses: 1, breakeven: 2 });
  });
});
