import { describe, expect, it } from "vitest";

import { describeRetention, findExpired, RETENTION_DAYS, WARN_WITHIN_DAYS } from "./trash-retention";

const ahora = new Date("2026-08-23T12:00:00Z");
const haceDias = (d: number) => new Date(ahora.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

describe("cuenta atrás de la papelera", () => {
  it("cuenta los días que quedan", () => {
    expect(describeRetention({ id: "a", deletedAt: haceDias(10) }, ahora).daysLeft).toBe(
      RETENTION_DAYS - 10,
    );
  });

  it("avisa cuando queda poco", () => {
    const justo = describeRetention(
      { id: "a", deletedAt: haceDias(RETENTION_DAYS - WARN_WITHIN_DAYS) },
      ahora,
    );
    expect(justo.expiring).toBe(true);

    const lejos = describeRetention({ id: "b", deletedAt: haceDias(1) }, ahora);
    expect(lejos.expiring).toBe(false);
  });

  it("no baja de cero ni enseña días negativos", () => {
    const vieja = describeRetention({ id: "a", deletedAt: haceDias(RETENTION_DAYS + 40) }, ahora);
    expect(vieja.daysLeft).toBe(0);
    expect(vieja.label).toBe("Se borra hoy");
  });

  it("habla en singular cuando queda un día", () => {
    expect(describeRetention({ id: "a", deletedAt: haceDias(RETENTION_DAYS - 1) }, ahora).label).toBe(
      "Queda 1 día",
    );
  });

  it("una fecha ilegible no se purga: se dice que no se sabe", () => {
    // Borrar algo por no saber leer su fecha es la peor forma de perderlo.
    const rota = describeRetention({ id: "a", deletedAt: "cualquier cosa" }, ahora);
    expect(rota.expiring).toBe(false);
    expect(rota.label).toContain("Sin fecha");
  });
});

describe("qué se purga", () => {
  it("solo lo que pasó de los treinta días", () => {
    expect(
      findExpired(
        [
          { id: "vieja", deletedAt: haceDias(RETENTION_DAYS + 1) },
          { id: "justa", deletedAt: haceDias(RETENTION_DAYS - 1) },
          { id: "nueva", deletedAt: haceDias(1) },
        ],
        ahora,
      ),
    ).toEqual(["vieja"]);
  });

  it("nunca purga una fecha que no se pudo leer", () => {
    expect(findExpired([{ id: "rota", deletedAt: "" }], ahora)).toEqual([]);
  });
});
