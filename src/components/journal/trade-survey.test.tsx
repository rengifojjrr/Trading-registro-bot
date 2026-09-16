// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TradeSurvey } from "./trade-survey";
import { MISTAKE_META } from "@/lib/journal/mistakes";
import { RESPUESTAS_VACIAS, SURVEY_TOTAL, type SurveyAnswers, type SurveyTrade } from "@/lib/journal/survey";

/**
 * Lo que tiene que cumplir la encuesta para que se conteste.
 *
 * No son detalles de estilo: cada una de estas pruebas fija una promesa que,
 * de romperse, devuelve la encuesta al sitio del que viene el formulario
 * largo -- algo que se cierra sin leer.
 */

const cerrar = vi.fn();

vi.mock("@/app/(dashboard)/trades/survey-actions", () => ({
  closeSurvey: (...args: unknown[]) => cerrar(...args),
}));

const TRADE_ID = "11111111-1111-4111-8111-111111111111";

/**
 * Guardar va por `fetch` y no por una Server Action a propósito -- una acción
 * refresca la ruta y cerraba la encuesta a media contestación --, así que lo
 * que se espía aquí es la petición.
 */
const peticiones: { url: string; cuerpo: unknown }[] = [];

function guardado() {
  return peticiones.map((p) => p.cuerpo);
}

beforeEach(() => {
  peticiones.length = 0;
  cerrar.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      peticiones.push({ url, cuerpo: JSON.parse(String(init?.body ?? "null")) });
      return new Response(JSON.stringify({ error: null }), { status: 200 });
    }),
  );
});

function operacion(answers: Partial<SurveyAnswers> = {}): SurveyTrade {
  return {
    id: TRADE_ID,
    productId: "BIP-20DEC30-CDE",
    direction: "LONG",
    closedAt: "2026-09-11T14:30:00Z",
    netPnl: "124.5",
    answers: { ...RESPUESTAS_VACIAS, ...answers },
  };
}

/** Con el setup ya puesto, que es donde empiezan las preguntas de siempre. */
function conSetup(answers: Partial<SurveyAnswers> = {}): SurveyTrade {
  return operacion({ setup: "A", ...answers });
}

function abrir(trade: SurveyTrade = operacion(), onClose = vi.fn()) {
  render(<TradeSurvey trade={trade} onClose={onClose} />);
  return { onClose };
}

describe("una pregunta a la vez", () => {
  it("empieza por la primera y no enseña la segunda", () => {
    abrir();
    expect(screen.getByRole("heading", { name: "¿Qué tal era el setup?" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "¿Seguiste tu plan?" })).toBeNull();
  });

  it("dice por dónde vas", () => {
    abrir();
    expect(screen.getByText(`1 de ${SURVEY_TOTAL}`)).toBeTruthy();
  });

  it("elegir una nota avanza sola, sin un segundo clic", async () => {
    const user = userEvent.setup();
    abrir(conSetup());

    await user.click(screen.getByRole("button", { name: /Casi todo/ }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "¿Qué tal estuvo la entrada?" })).toBeTruthy(),
    );
  });

  it("se puede volver atrás a cambiar lo contestado", async () => {
    const user = userEvent.setup();
    abrir(conSetup());

    await user.click(screen.getByRole("button", { name: /Casi todo/ }));
    await waitFor(() => screen.getByRole("heading", { name: "¿Qué tal estuvo la entrada?" }));
    await user.click(screen.getByRole("button", { name: /Atrás/ }));

    expect(screen.getByRole("heading", { name: "¿Seguiste tu plan?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Casi todo/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("cada respuesta se guarda al contestarla", () => {
  it("la nota viaja en cuanto se toca, no al final", async () => {
    const user = userEvent.setup();
    abrir(conSetup());

    await user.click(screen.getByRole("button", { name: /Entero/ }));

    await waitFor(() => expect(guardado()).toContainEqual({ step: "plan", rating: 5 }));
    expect(peticiones[0].url).toBe(`/api/trades/${TRADE_ID}/survey`);
  });

  it("guarda por una ruta y no por una acción, que es lo que la cerraba sola", async () => {
    const user = userEvent.setup();
    abrir(conSetup());

    await user.click(screen.getByRole("button", { name: /Entero/ }));

    // Una Server Action refresca la ruta al terminar; el panel vuelve a mirar
    // qué operación encuestar, ésta ya cuenta como apuntada, y el cuadro se
    // desmontaba a media encuesta. Nada de guardar puede pasar por ahí.
    await waitFor(() => expect(peticiones.length).toBeGreaterThan(0));
    expect(cerrar).not.toHaveBeenCalled();
  });

  it("la nota del setup viaja como nota, no como texto suelto", async () => {
    const user = userEvent.setup();
    abrir();

    await user.click(screen.getByRole("button", { name: "A+" }));

    await waitFor(() => expect(guardado()).toContainEqual({ step: "setup", grade: "A+" }));
  });

  it("las emociones se mandan al pasar de pregunta, con todas las marcadas", async () => {
    const user = userEvent.setup();
    abrir(conSetup({ plan: 3, entrada: 3 }));

    await user.click(screen.getByRole("button", { name: "Calma" }));
    await user.click(screen.getByRole("button", { name: "FOMO" }));
    await user.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() =>
      expect(guardado()).toContainEqual({ step: "animo", emotions: ["Calma", "FOMO"] }),
    );
  });

  it("desmarcar un error lo quita de lo que se manda", async () => {
    const user = userEvent.setup();
    abrir(conSetup({ plan: 3, entrada: 3, animo: ["Calma"], errores: ["FOMO"] }));

    // Con los errores ya puestos, la encuesta abre en la última; se vuelve a
    // ellos, que es justo el camino de quien quiere corregir lo que marcó.
    await user.click(screen.getByRole("button", { name: /Atrás/ }));
    expect(screen.getByRole("heading", { name: "¿Se coló algún error?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: MISTAKE_META.FOMO.label }));
    await user.click(screen.getByRole("button", { name: /Saltar|Siguiente/ }));

    await waitFor(() => expect(guardado()).toContainEqual({ step: "errores", mistakes: [] }));
  });
});

describe("se puede salir sin contestar", () => {
  it("el botón dice «Saltar» mientras no hayas contestado y «Siguiente» cuando sí", async () => {
    const user = userEvent.setup();
    abrir(conSetup({ plan: 3, entrada: 3 }));

    expect(screen.getByRole("button", { name: "Saltar" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Calma" }));
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeTruthy();
  });

  it("cerrar avisa al servidor para que no vuelva a salir sola", async () => {
    const user = userEvent.setup();
    const { onClose } = abrir();

    await user.click(screen.getByRole("button", { name: "Cerrar la encuesta" }));

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => expect(cerrar).toHaveBeenCalledWith(TRADE_ID, { completada: false }));
  });
});

describe("ir a mirar la operación", () => {
  it("hay salida a la ficha desde cada pregunta, no sólo al final", async () => {
    const user = userEvent.setup();
    abrir();

    for (let i = 0; i < SURVEY_TOTAL; i += 1) {
      const enlace = screen.getByRole("link", { name: /Ver la operación/ });
      expect(enlace.getAttribute("href")).toBe(`/trades/${TRADE_ID}`);
      await user.click(screen.getByRole("button", { name: /Saltar|Terminar/ }));
    }

    // Y también en la pantalla final.
    await waitFor(() => expect(screen.getByRole("link", { name: /Ver la operación/ })).toBeTruthy());
  });
});

describe("empieza donde lo dejaste", () => {
  it("con las tres primeras contestadas, abre en la cuarta", () => {
    abrir(conSetup({ plan: 4, entrada: 2 }));
    expect(screen.getByRole("heading", { name: "¿Cómo estabas mientras tanto?" })).toBeTruthy();
  });

  it("la nota de setup que ya tuviera puesta no se vuelve a preguntar", () => {
    abrir(conSetup());
    expect(screen.getByRole("heading", { name: "¿Seguiste tu plan?" })).toBeTruthy();
  });
});

describe("el final", () => {
  it("resume lo contestado y no inventa lo saltado", async () => {
    const user = userEvent.setup();
    abrir(conSetup({ plan: 4, entrada: 2, animo: ["Miedo"], errores: ["FOMO"] }));

    expect(screen.getByRole("heading", { name: "¿Qué te llevas de ésta?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Terminar" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Apuntada" })).toBeTruthy());
    expect(screen.getByText("Casi todo")).toBeTruthy();
    expect(screen.getByText("Miedo")).toBeTruthy();
    // Nada de «Te llevas», que es lo que no se contestó.
    expect(screen.queryByText("Te llevas")).toBeNull();
  });

  it("sin contestar nada, el final no finge un resumen", async () => {
    const user = userEvent.setup();
    abrir();

    for (let i = 0; i < SURVEY_TOTAL; i += 1) {
      await user.click(screen.getByRole("button", { name: /Saltar|Terminar/ }));
    }

    await waitFor(() => expect(screen.getByRole("heading", { name: "Hasta la próxima" })).toBeTruthy());
  });
});
