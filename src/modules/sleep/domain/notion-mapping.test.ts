import { describe, expect, it } from "vitest";

import { labelledMinutes, mapNotionNight, minutesBetweenClocks } from "./notion-mapping";

function page(properties: Record<string, unknown>, id = "night-1") {
  return {
    id,
    properties: {
      "Dia de dormir ": { type: "date", date: { start: "2026-03-14" } },
      ...properties,
    },
  };
}

const select = (name: string) => ({ type: "select", select: { name } });
const multi = (...names: string[]) => ({
  type: "multi_select",
  multi_select: names.map((name) => ({ name })),
});
const text = (value: string) => ({ type: "rich_text", rich_text: [{ plain_text: value }] });

describe("mapNotionNight", () => {
  it("convierte las dos etiquetas de hora en relojes de verdad", () => {
    const result = mapNotionNight(
      page({
        "A que hora Dormí ": select("2am"),
        "Hora de despertar ": select("10am"),
      }),
    );

    expect(result?.night.bedtime).toBe("02:00");
    expect(result?.night.wake_time).toBe("10:00");
    expect(result?.warnings).toEqual([]);
  });

  it("entiende las formas raras que hay de verdad en la base", () => {
    const result = mapNotionNight(
      page({
        "A que hora Dormí ": select("1:am"),
        "Hora de despertar ": select("7:30"),
      }),
    );

    expect(result?.night.bedtime).toBe("01:00");
    expect(result?.night.wake_time).toBe("07:30");
  });

  it("corrige la ortografía de las opciones en lugar de perderlas", () => {
    const result = mapNotionNight(
      page({
        "Animo al despertar ": multi("Con energia"),
        "Desperté": multi("Con Alarma", "Desperte durante la noche"),
      }),
    );

    // Notion escribe «Con energia»; aquí la opción se llama «Con energía».
    expect(result?.night.mood_on_waking).toEqual(["Con energía"]);
    expect(result?.night.woke_how).toEqual(["Con alarma", "Desperté durante la noche"]);
    expect(result?.warnings).toEqual([]);
  });

  it("conserva las opciones propias del usuario que no eran genéricas", () => {
    const result = mapNotionNight(
      page({
        "Desperté": multi("Karim me despertó"),
        "antes de dormir ": multi("Hablar con Luisa"),
      }),
    );

    expect(result?.night.woke_how).toEqual(["Karim me despertó"]);
    expect(result?.night.before_bed).toEqual(["Hablar con Luisa"]);
  });

  it("avisa cuando el reloj y la etiqueta de duración se contradicen", () => {
    const result = mapNotionNight(
      page({
        "A que hora Dormí ": select("2am"),
        "Hora de despertar ": select("6am"),
        "Cuanto tiempo Dormí? ": multi("8 horas"),
      }),
    );

    // Cuatro horas de reloj contra ocho apuntadas a mano.
    expect(result?.warnings.some((w) => w.includes("el reloj dice"))).toBe(true);
    // Y gana el reloj: la etiqueta no se guarda en ningún sitio.
    expect(result?.night.bedtime).toBe("02:00");
  });

  it("no avisa por media hora de diferencia, que es redondeo", () => {
    const result = mapNotionNight(
      page({
        "A que hora Dormí ": select("2am"),
        "Hora de despertar ": select("10am"),
        "Cuanto tiempo Dormí? ": multi("8 horas"),
      }),
    );

    expect(result?.warnings).toEqual([]);
  });

  it("avisa de una hora que no sabe leer, en vez de descartarla en silencio", () => {
    const result = mapNotionNight(page({ "A que hora Dormí ": select("por la madrugada") }));

    expect(result?.night.bedtime).toBeNull();
    expect(result?.warnings).toContain("Hora de acostarse ilegible: «por la madrugada»");
  });

  it("trae el sueño narrado, las notas y el sitio", () => {
    const result = mapNotionNight(
      page({
        "Sueño": text("Soñé con un tren"),
        Notas: text("Dormí mal"),
        "Donde ": text("Casa"),
      }),
    );

    expect(result?.night.dream).toBe("Soñé con un tren");
    expect(result?.night.notes).toBe("Dormí mal");
    expect(result?.night.place).toBe("Casa");
  });

  it("redondea el puntaje, porque el formulario son botones enteros", () => {
    const result = mapNotionNight(page({ Puntaje: { type: "number", number: 7.5 } }));
    expect(result?.night.score).toBe(8);
  });

  it("descarta una noche sin fecha: no habría dónde archivarla", () => {
    expect(mapNotionNight({ id: "x", properties: {} })).toBeNull();
  });

  it("no inventa nada cuando la fila está casi vacía", () => {
    const result = mapNotionNight(page({}));

    expect(result?.night.bedtime).toBeNull();
    expect(result?.night.score).toBeNull();
    expect(result?.night.before_bed).toEqual([]);
    expect(result?.warnings).toEqual([]);
  });
});

describe("minutesBetweenClocks", () => {
  it("cruza la medianoche", () => {
    expect(minutesBetweenClocks("23:00", "07:00")).toBe(480);
    expect(minutesBetweenClocks("02:00", "10:00")).toBe(480);
  });

  it("mide una siesta del mediodía sin dar la vuelta al reloj", () => {
    expect(minutesBetweenClocks("12:00", "14:00")).toBe(120);
  });
});

describe("labelledMinutes", () => {
  it("saca las horas de la etiqueta escrita a mano", () => {
    expect(labelledMinutes(["8 horas"])).toBe(480);
    expect(labelledMinutes(["+8 horas"])).toBe(480);
    expect(labelledMinutes(["-4 horas"])).toBe(240);
  });

  it("devuelve null si no hay ninguna etiqueta con horas", () => {
    expect(labelledMinutes([])).toBeNull();
    expect(labelledMinutes(["mucho"])).toBeNull();
  });
});
