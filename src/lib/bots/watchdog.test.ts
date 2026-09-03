import { describe, expect, it } from "vitest";

import {
  diasSinOperar,
  medirPulso,
  operacionesEnVentana,
  ritmoEsperado,
  watchdog,
  type BotParaWatchdog,
  type OperacionDelPulso,
} from "./watchdog";

const AHORA = new Date("2026-09-03T12:00:00Z");

function haceDias(n: number): string {
  return new Date(AHORA.getTime() - n * 86_400_000).toISOString();
}

/** Una operación por cada día atrás de la lista, cerrada al día siguiente. */
function operaciones(diasAtras: number[]): OperacionDelPulso[] {
  return diasAtras.map((d) => ({ openedAt: haceDias(d), closedAt: haceDias(Math.max(0, d - 1)) }));
}

function bot(parcial: Partial<BotParaWatchdog> = {}): BotParaWatchdog {
  return {
    id: "b1",
    nombre: "Bot",
    fase: "F7",
    esperadasAlMes: null,
    operaciones: [],
    ...parcial,
  };
}

describe("medirPulso", () => {
  it("cincuenta y nueve operaciones cuando prometió cincuenta y ocho está sano", () => {
    const lectura = medirPulso(
      bot({
        esperadasAlMes: 58,
        operaciones: operaciones(Array.from({ length: 59 }, (_, i) => i % 29)),
      }),
      AHORA,
    );

    expect(lectura.estado).toBe("SANO");
    expect(lectura.observadas).toBe(59);
    expect(lectura.ratio).toBeCloseTo(59 / (58 * (30 / 30.44)), 6);
    expect(Math.abs(lectura.desvioPct ?? 99)).toBeLessThan(10);
  });

  it("cero operaciones cuando prometía siete es un bot muerto, aunque no haya perdido nada", () => {
    const lectura = medirPulso(bot({ esperadasAlMes: 7 }), AHORA);

    expect(lectura.estado).toBe("SILENCIOSO");
    expect(lectura.observadas).toBe(0);
    expect(lectura.desvioPct).toBe(-100);
    expect(lectura.diasSinOperar).toBeNull();
    expect(lectura.motivo).toContain("Nunca ha operado");
  });

  it("operar mucho más de lo prometido también es una avería", () => {
    const lectura = medirPulso(
      bot({ esperadasAlMes: 4, operaciones: operaciones(Array.from({ length: 20 }, (_, i) => i)) }),
      AHORA,
    );

    expect(lectura.estado).toBe("HIPERACTIVO");
    expect(lectura.desvioPct).toBeGreaterThan(300);
  });

  it("el umbral del silencio está en la cuarta parte de lo prometido", () => {
    const conNueve = medirPulso(
      bot({ esperadasAlMes: 40, operaciones: operaciones(Array.from({ length: 9 }, (_, i) => i)) }),
      AHORA,
    );
    const conOnce = medirPulso(
      bot({ esperadasAlMes: 40, operaciones: operaciones(Array.from({ length: 11 }, (_, i) => i)) }),
      AHORA,
    );

    expect(conNueve.estado).toBe("SILENCIOSO");
    expect(conOnce.estado).toBe("SANO");
  });

  it("sin ritmo declarado, o con un ritmo demasiado lento, no hay pulso que tomar", () => {
    expect(medirPulso(bot({ esperadasAlMes: null }), AHORA).estado).toBe("SIN_RITMO");

    const lento = medirPulso(bot({ esperadasAlMes: 1 }), AHORA);
    expect(lento.estado).toBe("SIN_RITMO");
    expect(lento.esperadas).toBeNull();
    expect(lento.ratio).toBeNull();
  });

  it("una posición abierta cuenta como latido y se dice en el motivo", () => {
    const lectura = medirPulso(
      bot({ esperadasAlMes: 30, operaciones: [{ openedAt: haceDias(20), closedAt: null }] }),
      AHORA,
    );

    expect(lectura.observadas).toBe(1);
    expect(lectura.enMercado).toBe(true);
    expect(lectura.estado).toBe("SILENCIOSO");
    expect(lectura.motivo).toContain("posición abierta");
  });
});

describe("operacionesEnVentana", () => {
  it("cuenta las que abrieron o cerraron dentro, y no las de antes", () => {
    const ops: OperacionDelPulso[] = [
      { openedAt: haceDias(5), closedAt: haceDias(4) }, // entera dentro
      { openedAt: haceDias(60), closedAt: haceDias(2) }, // abrió antes, cerró dentro
      { openedAt: haceDias(90), closedAt: haceDias(80) }, // entera fuera
      { openedAt: haceDias(45), closedAt: null }, // abierta desde antes de la ventana
    ];

    expect(operacionesEnVentana(ops, AHORA, 30)).toBe(2);
    expect(operacionesEnVentana(ops, AHORA, 100)).toBe(4);
  });
});

describe("diasSinOperar", () => {
  it("mira la más reciente de las dos puntas", () => {
    const ops: OperacionDelPulso[] = [
      { openedAt: haceDias(40), closedAt: haceDias(3) },
      { openedAt: haceDias(10), closedAt: haceDias(9) },
    ];
    expect(diasSinOperar(ops, AHORA)).toBe(3);
  });

  it("sin operaciones no hay fecha que contar", () => {
    expect(diasSinOperar([], AHORA)).toBeNull();
  });
});

describe("watchdog", () => {
  it("no vigila a los retirados: un muerto que no opera hace lo que debe", () => {
    const resumen = watchdog(
      [bot({ id: "vivo", esperadasAlMes: 20 }), bot({ id: "muerto", fase: "RETIRADO", esperadasAlMes: 20 })],
      AHORA,
    );

    expect(resumen.lecturas.map((l) => l.botId)).toEqual(["vivo"]);
    expect(resumen.silenciosos).toBe(1);
  });

  it("cuenta por estado y ordena las alertas por desvío", () => {
    const resumen = watchdog(
      [
        bot({ id: "sano", esperadasAlMes: 30, operaciones: operaciones(Array.from({ length: 30 }, (_, i) => i)) }),
        bot({ id: "mudo", esperadasAlMes: 30 }),
        bot({
          id: "loco",
          esperadasAlMes: 4,
          operaciones: operaciones(Array.from({ length: 40 }, (_, i) => i % 29)),
        }),
        bot({ id: "sinritmo" }),
      ],
      AHORA,
    );

    expect(resumen.sanos).toBe(1);
    expect(resumen.silenciosos).toBe(1);
    expect(resumen.hiperactivos).toBe(1);
    expect(resumen.sinRitmo).toBe(1);
    expect(resumen.alertas.map((a) => a.botId)).toEqual(["loco", "mudo"]);
  });
});

describe("ritmoEsperado", () => {
  it("manda lo declarado", () => {
    expect(ritmoEsperado(12, 40, 400)).toBe(12);
  });

  it("sin declarar vale el ritmo propio, pero sólo con dos meses de histórico", () => {
    expect(ritmoEsperado(null, 40, 400)).toBe(40);
    expect(ritmoEsperado(null, 40, 10)).toBeNull();
  });
});
