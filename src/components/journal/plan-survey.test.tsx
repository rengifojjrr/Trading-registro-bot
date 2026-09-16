// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanSurvey } from "./plan-survey";
import { PLAN_TOTAL, PLAN_VACIO, type PlanAnswers, type TradePlan } from "@/lib/journal/plan";

/**
 * Lo que tiene que cumplir el plan de antes de entrar.
 *
 * La promesa que fija cada una de estas pruebas es la misma: que escribir un
 * plan cueste menos que no escribirlo. Lo que se rompa aquí devuelve esto al
 * sitio del que viene el formulario largo -- algo que se cierra sin usar.
 */

const cerrar = vi.fn();

vi.mock("@/app/(dashboard)/trading/plan-actions", () => ({
  terminarPlan: (...args: unknown[]) => cerrar(...args),
  empezarPlan: vi.fn(),
  tirarPlan: vi.fn(),
}));

const PLAN_ID = "44444444-4444-4444-8444-444444444444";

/** Las peticiones de guardado, que es por donde viaja cada respuesta. */
const peticiones: { url: string; cuerpo: unknown }[] = [];

const guardado = () => peticiones.map((p) => p.cuerpo);

beforeEach(() => {
  peticiones.length = 0;
  cerrar.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const cuerpo = init?.body instanceof FormData ? "(imagen)" : JSON.parse(String(init?.body ?? "null"));
      peticiones.push({ url, cuerpo });
      return new Response(
        JSON.stringify({ error: null, ruta: "u/planes/x.png", url: "blob:subida" }),
        { status: 200 },
      );
    }),
  );
});

function plan(answers: Partial<PlanAnswers> = {}, fotoUrl: string | null = null): TradePlan {
  return {
    id: PLAN_ID,
    createdAt: "2026-09-16T10:00:00Z",
    answers: { ...PLAN_VACIO, ...answers },
    fotoUrl,
  };
}

function abrir(p: TradePlan = plan(), onClose = vi.fn()) {
  render(<PlanSurvey plan={p} onClose={onClose} />);
  return { onClose };
}

describe("una pregunta a la vez, como las demás encuestas", () => {
  it("empieza por la dirección, que es de la que cuelgan las otras", () => {
    abrir();
    expect(screen.getByRole("heading", { name: "¿Hacia dónde crees que va?" })).toBeTruthy();
    expect(screen.getByText(`1 de ${PLAN_TOTAL}`)).toBeTruthy();
  });

  it("elegirla avanza sola, sin un segundo clic", async () => {
    const user = userEvent.setup();
    abrir();

    await user.click(screen.getByRole("button", { name: /Largo/ }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "¿Qué has visto?" })).toBeTruthy());
  });

  it("empieza donde lo dejaste", () => {
    abrir(plan({ direccion: "LONG", idea: "rechazo del máximo" }));
    expect(screen.getByRole("heading", { name: "¿Dónde piensas entrar?" })).toBeTruthy();
  });
});

describe("cada respuesta se guarda al contestarla", () => {
  it("la dirección viaja en cuanto se toca", async () => {
    const user = userEvent.setup();
    abrir();

    await user.click(screen.getByRole("button", { name: /Corto/ }));

    await waitFor(() => expect(guardado()).toContainEqual({ step: "direccion", value: "SHORT" }));
    expect(peticiones[0].url).toBe(`/api/planes/${PLAN_ID}`);
  });

  it("un precio viaja como número, no como el texto que tecleaste", async () => {
    const user = userEvent.setup();
    abrir(plan({ direccion: "LONG", idea: "algo" }));

    await user.type(screen.getByRole("textbox"), "68450");
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(guardado()).toContainEqual({ step: "entrada", value: 68450 }));
  });

  it("guarda por una ruta y no por una acción, que es lo que cerraría el cuadro solo", async () => {
    const user = userEvent.setup();
    abrir();

    await user.click(screen.getByRole("button", { name: /Largo/ }));

    await waitFor(() => expect(peticiones.length).toBeGreaterThan(0));
    // Una Server Action refrescaría la ruta, el panel volvería a buscar el plan
    // pendiente y el cuadro se desmontaría a media encuesta.
    expect(cerrar).not.toHaveBeenCalled();
  });
});

describe("la cuenta que hace que valga la pena escribirlo", () => {
  it("dice cuánto ganas por lo que arriesgas, antes de entrar", async () => {
    abrir(plan({ direccion: "LONG", idea: "x", entrada: 100, stop: 90, objetivo: 130 }));

    // 30 de premio contra 10 de riesgo. Verlo *antes* es lo único que puede
    // hacer que alguien se replantee el objetivo.
    expect(screen.getByText(/3\.0/)).toBeTruthy();
    expect(screen.getByText(/por cada 1 que arriesgas/)).toBeTruthy();
  });

  it("y avisa si el stop está del lado que no toca", () => {
    abrir(plan({ direccion: "LONG", idea: "x", entrada: 100, stop: 110, objetivo: 130 }));

    expect(screen.getByText(/están del lado contrario/)).toBeTruthy();
    // Nada de ratios: un stop por encima de la entrada en un largo no es un
    // ratio pobre, es un error de tecleo.
    expect(screen.queryByText(/por cada 1 que arriesgas/)).toBeNull();
  });

  it("sin los tres precios no inventa ninguna cuenta", () => {
    abrir(plan({ direccion: "LONG", idea: "x", entrada: 100 }));
    expect(screen.queryByText(/por cada 1 que arriesgas/)).toBeNull();
    expect(screen.queryByText(/están del lado contrario/)).toBeNull();
  });
});

describe("la foto", () => {
  it("se sube por su propia ruta y queda apuntada en el plan", async () => {
    const user = userEvent.setup();
    abrir(
      plan({ direccion: "LONG", idea: "x", entrada: 100, stop: 90, objetivo: 130, riesgo: 50, animo: ["Calma"] }),
    );

    expect(screen.getByRole("heading", { name: "¿Una foto del gráfico?" })).toBeTruthy();

    const archivo = new File(["x"], "grafico.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("¿Una foto del gráfico?"), archivo);

    // Por su propia ruta: las demás respuestas son unos bytes de JSON y ésta
    // son megas de imagen, y no pueden compartir camino.
    await waitFor(() =>
      expect(peticiones.some((p) => p.url === `/api/planes/${PLAN_ID}/foto`)).toBe(true),
    );
    // La subida ya deja la ruta guardada en el plan, así que no hace falta un
    // segundo guardado para que sobreviva a cerrar el cuadro.
    expect(guardado()).not.toContainEqual({ step: "foto", value: "u/planes/x.png" });
  });

  it("quitarla llega al servidor en el momento, no al pasar de pregunta", async () => {
    const user = userEvent.setup();
    abrir(
      plan(
        {
          direccion: "LONG",
          idea: "x",
          entrada: 100,
          stop: 90,
          objetivo: 130,
          riesgo: 50,
          animo: ["Calma"],
          foto: "u/planes/vieja.png",
        },
        // Firmada por el servidor al leer el plan, que es como llega de verdad.
        "https://ejemplo.test/vieja.png",
      ),
    );

    // Con todo contestado, reabrir un plan empieza por el principio: se avanza
    // hasta la foto, que es el camino de quien vuelve a cambiarla.
    while (screen.queryByRole("button", { name: "Quitarla" }) === null) {
      await user.click(screen.getByRole("button", { name: /Siguiente|Saltar/ }));
    }

    // Si sólo cambiara el estado de la pantalla, quitar la foto y cerrar
    // dejaría una imagen que ya no se ve pero sigue guardada.
    await user.click(screen.getByRole("button", { name: "Quitarla" }));

    await waitFor(() => expect(guardado()).toContainEqual({ step: "foto", value: "" }));
  });
});

describe("al acabar", () => {
  it("dice que queda esperando, que es lo que hace que sirva de algo", async () => {
    const user = userEvent.setup();
    abrir(plan({ direccion: "LONG", idea: "x", entrada: 100, stop: 90, objetivo: 130, riesgo: 50, animo: ["Calma"] }));

    await user.click(screen.getByRole("button", { name: /Saltar|Terminar/ }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Plan guardado" })).toBeTruthy());
    expect(screen.getByText(/se te preguntará si es ésta/)).toBeTruthy();
  });

  it("sin contestar nada no finge un plan", async () => {
    const user = userEvent.setup();
    abrir();

    for (let i = 0; i < PLAN_TOTAL; i += 1) {
      await user.click(screen.getByRole("button", { name: /Saltar|Terminar/ }));
    }

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sin plan, entonces" })).toBeTruthy());
  });

  it("cerrarlo avisa al servidor, que es quien tira los vacíos", async () => {
    const user = userEvent.setup();
    const { onClose } = abrir();

    await user.click(screen.getByRole("button", { name: "Cerrar el plan" }));

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(cerrar).toHaveBeenCalledWith(PLAN_ID));
  });
});
