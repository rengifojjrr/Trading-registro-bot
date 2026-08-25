import { describe, expect, it } from "vitest";

import {
  compareByHabits,
  compareByReading,
  compareBySleep,
  compareByTasks,
  MIN_DAYS_PER_SIDE,
  type DayRow,
} from "./life-correlation";

const dia = (over: Partial<DayRow> & { date: string }): DayRow => ({
  sleepMinutes: 480,
  sleepScore: 8,
  habitsDone: 4,
  habitsTracked: 5,
  tasksDone: 2,
  didRead: false,
  netPnl: "100",
  tradeCount: 1,
  ...over,
});

/** N días iguales, con fechas distintas para que sean días de verdad. */
const dias = (n: number, over: Partial<DayRow>): DayRow[] =>
  Array.from({ length: n }, (_, i) => dia({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, ...over }));

describe("cruce con el sueño", () => {
  it("no dice nada hasta tener muestra a los dos lados", () => {
    // Con tres días a cada lado siempre sale una diferencia y no significa
    // nada. La respuesta honesta antes de eso es «todavía no se sabe».
    const resultado = compareBySleep([
      ...dias(3, { sleepMinutes: 300, netPnl: "-200" }),
      ...dias(3, { sleepMinutes: 500, netPnl: "300" }),
    ]);
    expect(resultado.worse).toBeNull();
    expect(resultado.difference).toBeNull();
    expect(resultado.verdict).toContain(String(MIN_DAYS_PER_SIDE));
  });

  it("compara los dos grupos cuando hay días suficientes", () => {
    const pocos = dias(10, { sleepMinutes: 300, netPnl: "-200" }).map((d, i) => ({
      ...d,
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    }));
    const muchos = dias(10, { sleepMinutes: 500, netPnl: "300" });

    const resultado = compareBySleep([...pocos, ...muchos]);
    expect(resultado.worse?.days).toBe(10);
    expect(resultado.better?.days).toBe(10);
    expect(resultado.difference).toBe("500.00");
  });

  it("usa la mediana, así que un día enorme no arrastra el grupo", () => {
    // Nueve días de +10 y uno de +5.000: la media diría 509, la mediana dice
    // 10. Sin esto, una sola operación decidiría la conclusión.
    const raros = dias(9, { sleepMinutes: 500, netPnl: "10" });
    raros.push(dia({ date: "2026-08-20", sleepMinutes: 500, netPnl: "5000" }));

    const resultado = compareBySleep([
      ...raros,
      ...dias(10, { sleepMinutes: 300, netPnl: "10" }).map((d, i) => ({
        ...d,
        date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      })),
    ]);
    expect(resultado.better?.medianPnl).toBe("10.00");
  });

  it("habla de coincidencia, no de causa", () => {
    // Que ganes menos los días que duermes poco no demuestra que sea por
    // dormir poco: puede que las dos cosas pasen los días que hay noticias.
    const resultado = compareBySleep([
      ...dias(10, { sleepMinutes: 300, netPnl: "-200" }).map((d, i) => ({
        ...d,
        date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      })),
      ...dias(10, { sleepMinutes: 500, netPnl: "300" }),
    ]);
    expect(resultado.verdict).toContain("coincidencia observada");
    expect(resultado.verdict).not.toContain("porque");
  });

  it("ignora los días sin sueño apuntado y los días sin operar", () => {
    const resultado = compareBySleep([
      ...dias(10, { sleepMinutes: null }),
      ...dias(10, { tradeCount: 0 }).map((d, i) => ({ ...d, date: `2026-07-${String(i + 1).padStart(2, "0")}` })),
    ]);
    expect(resultado.better).toBeNull();
  });

  it("el umbral se puede mover", () => {
    const resultado = compareBySleep(
      [
        ...dias(10, { sleepMinutes: 330 }).map((d, i) => ({ ...d, date: `2026-07-${String(i + 1).padStart(2, "0")}` })),
        ...dias(10, { sleepMinutes: 400 }),
      ],
      360,
    );
    expect(resultado.question).toContain("6 horas");
    expect(resultado.worse?.days).toBe(10);
  });
});

describe("cruce con los hábitos", () => {
  it("parte por la mitad de los hábitos cumplidos", () => {
    const resultado = compareByHabits([
      ...dias(10, { habitsDone: 1, habitsTracked: 5, netPnl: "-50" }).map((d, i) => ({
        ...d,
        date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      })),
      ...dias(10, { habitsDone: 5, habitsTracked: 5, netPnl: "120" }),
    ]);
    expect(resultado.worse?.days).toBe(10);
    expect(resultado.difference).toBe("170.00");
  });

  it("ignora los días sin hábitos que seguir", () => {
    const resultado = compareByHabits(dias(20, { habitsTracked: 0 }));
    expect(resultado.better).toBeNull();
  });

  it("cuenta los días en verde de cada grupo", () => {
    const mezcla = dias(10, { habitsDone: 5, habitsTracked: 5, netPnl: "100" });
    mezcla[0] = { ...mezcla[0], netPnl: "-100" };

    const resultado = compareByHabits([
      ...mezcla,
      ...dias(10, { habitsDone: 0, habitsTracked: 5, netPnl: "-10" }).map((d, i) => ({
        ...d,
        date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      })),
    ]);
    expect(resultado.better?.winningDays).toBe(9);
    expect(resultado.worse?.winningDays).toBe(0);
  });
});

describe("cruce con las tareas", () => {
  it("parte entre días con alguna cerrada y días sin ninguna", () => {
    // El corte es «alguna» y no una cifra alta a propósito: lo que se compara
    // es haber estado operativo, no haber sido productivo.
    const resultado = compareByTasks([
      ...dias(10, { tasksDone: 0, netPnl: "-40" }).map((d, i) => ({
        ...d,
        date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      })),
      ...dias(10, { tasksDone: 3, netPnl: "90" }),
    ]);
    expect(resultado.worse?.days).toBe(10);
    expect(resultado.difference).toBe("130.00");
  });

  it("ignora los días sin operar", () => {
    expect(compareByTasks(dias(20, { tradeCount: 0 })).better).toBeNull();
  });
});

describe("cruce con las lecturas", () => {
  it("compara los días que leíste con los que no", () => {
    const resultado = compareByReading([
      ...dias(10, { didRead: false, netPnl: "10" }).map((d, i) => ({
        ...d,
        date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      })),
      ...dias(10, { didRead: true, netPnl: "10" }),
    ]);
    // Sin diferencia también es una respuesta, y saberlo evita seguir
    // buscándole sentido a un cruce que no dice nada.
    expect(resultado.difference).toBe("0.00");
    expect(resultado.verdict).toContain("No se ve diferencia");
  });
});
