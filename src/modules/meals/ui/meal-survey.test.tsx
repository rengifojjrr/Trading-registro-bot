// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MealSurvey } from "./meal-survey";
import type { MealRow } from "@/modules/meals/queries";

/**
 * Lo que tiene que cumplir la encuesta de comidas.
 *
 * Dos cosas que ningún otro módulo pide y que estas pruebas existen para que
 * nadie rompa: que las plantillas sigan costando un toque --se come lo mismo
 * muchas veces-- y que la comida no nazca hasta que se sepa qué se come.
 */

const guardados: {
  mealId: string | null;
  campo: string;
  valor: unknown;
  respuestas: Record<string, unknown>;
}[] = [];

const NUEVO = "55555555-5555-8555-8555-555555555555";

vi.mock("@/modules/meals/actions", () => ({
  saveMealAnswer: async (entrada: {
    mealId: string | null;
    campo: string;
    valor: unknown;
    respuestas: Record<string, unknown>;
  }) => {
    guardados.push(entrada);
    const nombre = entrada.respuestas.name;
    const puedeNacer = typeof nombre === "string" && nombre.trim() !== "";
    return {
      error: null,
      success: true,
      // Como el servidor de verdad: sin nombre no hay fila, así que no hay id.
      id: entrada.mealId ?? (puedeNacer ? NUEVO : null),
    };
  },
}));

const HOY = "2026-03-15";

function comida(extra: Partial<MealRow> = {}): MealRow {
  return {
    id: "99999999-9999-8999-8999-999999999999",
    meal_date: "2026-03-10",
    meal_type: "CENA",
    name: "Lentejas",
    notes: null,
    cook: null,
    icon: null,
    ingredients: [],
    ...extra,
  } as MealRow;
}

beforeEach(() => {
  guardados.length = 0;
});

describe("una pregunta a la vez", () => {
  it("abre en «¿qué se come?»: el tipo y el día ya vienen del hueco", () => {
    render(<MealSurvey date={HOY} hoy={HOY} />);
    expect(screen.getByRole("heading", { name: "¿Qué se come?" })).toBeTruthy();
  });

  it("respeta el hueco desde el que se entra", async () => {
    const user = userEvent.setup();
    render(<MealSurvey date="2026-03-20" hoy={HOY} defaultType="DESAYUNO" />);

    await user.type(screen.getByRole("textbox"), "Tostadas");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0].respuestas).toMatchObject({
      meal_type: "DESAYUNO",
      meal_date: "2026-03-20",
    });
  });
});

describe("la comida nace del nombre", () => {
  it("el nombre la crea y las demás respuestas escriben en ella", async () => {
    const user = userEvent.setup();
    render(<MealSurvey date={HOY} hoy={HOY} />);

    await user.type(screen.getByRole("textbox"), "Lentejas");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "¿Con qué?" })).toBeTruthy());

    await user.type(screen.getByRole("textbox"), "200 g lentejas");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(guardados).toHaveLength(2));
    expect(guardados[0]).toMatchObject({ mealId: null, campo: "name" });
    expect(guardados[1]).toMatchObject({ mealId: NUEVO, campo: "ingredients" });
  });

  /**
   * El fallo que esta prueba impide: sin mandar todo lo contestado, la comida
   * nacería sólo con el nombre y lo escrito antes --el tipo, o unos
   * ingredientes pegados de una plantilla-- se perdería al crearla.
   */
  it("al nacer se lleva lo que ya se había contestado", async () => {
    const user = userEvent.setup();
    render(<MealSurvey date={HOY} hoy={HOY} />);

    // Saltar el nombre para contestar los ingredientes antes.
    await user.click(screen.getByRole("button", { name: "Saltar" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "¿Con qué?" })).toBeTruthy());
    await user.type(screen.getByRole("textbox"), "2 huevos");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    // Todavía no hay comida: nadie sabe qué se come.
    await waitFor(() => expect(guardados.length).toBeGreaterThan(0));
    expect(guardados.every((g) => g.mealId === null)).toBe(true);

    // Y al volver a por el nombre, los ingredientes viajan con él.
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    await user.click(screen.getByRole("button", { name: "Atrás" }));
    await user.type(screen.getByRole("textbox"), "Tortilla");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(guardados.at(-1)?.mealId).toBeNull());
    expect(guardados.at(-1)?.respuestas).toMatchObject({
      name: "Tortilla",
      ingredients: "2 huevos",
    });
  });

  it("sin nombre no finge que hay comida", async () => {
    const user = userEvent.setup();
    render(<MealSurvey date={HOY} hoy={HOY} />);

    while (screen.queryByRole("heading", { name: "Sin comida, entonces" }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }

    expect(screen.getByText(/Hace falta al menos saber qué se come/)).toBeTruthy();
    expect(guardados.every((g) => g.mealId === null)).toBe(true);
  });
});

describe("las plantillas siguen costando un toque", () => {
  const PLANTILLA = [
    {
      id: "p1",
      module_id: "meals",
      name: "Desayuno de siempre",
      payload: { name: "Avena con fruta", meal_type: "DESAYUNO" },
      body: "60 g avena\n1 plátano",
      created_at: "2026-03-01T00:00:00Z",
    },
  ];

  it("aplicarla deja la comida escrita sin contestar una pregunta", async () => {
    const user = userEvent.setup();
    render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <MealSurvey date={HOY} hoy={HOY} templates={PLANTILLA as any} />,
    );

    // El de aplicar, no el de borrar, que lleva el nombre en su etiqueta.
    await user.click(screen.getByRole("button", { name: "Desayuno de siempre" }));

    await waitFor(() => expect(guardados.length).toBeGreaterThan(0));
    // Una sola llamada: la fila nace con todo lo de la plantilla dentro, así
    // que repetir el tipo y los ingredientes sería escribir lo mismo tres veces.
    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toMatchObject({ mealId: null, campo: "name" });
    expect(guardados[0].respuestas).toMatchObject({
      name: "Avena con fruta",
      meal_type: "DESAYUNO",
      ingredients: "60 g avena\n1 plátano",
    });
  });
});

describe("al acabar", () => {
  it("deja apuntar otra: son tres al día", async () => {
    const user = userEvent.setup();
    render(<MealSurvey date={HOY} hoy={HOY} />);

    await user.type(screen.getByRole("textbox"), "Lentejas");
    while (screen.queryByRole("button", { name: "Apuntar otra comida" }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }

    await user.click(screen.getByRole("button", { name: "Apuntar otra comida" }));

    expect(screen.getByRole("heading", { name: "¿Qué se come?" })).toBeTruthy();
    await user.type(screen.getByRole("textbox"), "Sopa");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    // De cero: si arrastrara el id, la segunda comida escribiría encima de la
    // primera en vez de ser otra.
    await waitFor(() => expect(guardados.at(-1)).toMatchObject({ mealId: null, campo: "name" }));
  });

  it("corrigiendo una comida vieja no ofrece apuntar otra", async () => {
    const user = userEvent.setup();
    render(<MealSurvey date="2026-03-10" hoy={HOY} meal={comida()} />);

    while (screen.queryByRole("heading", { name: "Comida guardada." }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar|Terminar/ }));
    }

    expect(screen.queryByRole("button", { name: "Apuntar otra comida" })).toBeNull();
  });
});
