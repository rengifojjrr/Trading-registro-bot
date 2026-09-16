// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SurveyGate } from "./survey-gate";
import { RESPUESTAS_VACIAS, type SurveyTrade } from "@/lib/journal/survey";

/**
 * El pestillo del cuadro que sale solo.
 *
 * Esto fija **el fallo que hacía la encuesta casi inservible**: se cerraba
 * antes de terminarla. La candidata la propone el servidor, y contestar una
 * pregunta hacía que la operación dejara de serlo -- ya contaba como
 * apuntada --, así que cualquier repintado del panel traía `null` y desmontaba
 * el cuadro a media contestación.
 *
 * La promesa que se prueba: una vez abierta, sólo la cierra quien la está
 * contestando.
 */

vi.mock("@/app/(dashboard)/trades/survey-actions", () => ({
  closeSurvey: vi.fn().mockResolvedValue({ error: null }),
}));

function operacion(id: string): SurveyTrade {
  return {
    id,
    productId: "BIP-20DEC30-CDE",
    direction: "LONG",
    closedAt: "2026-09-11T14:30:00Z",
    netPnl: "124.5",
    answers: { ...RESPUESTAS_VACIAS },
  };
}

const PRIMERA = operacion("11111111-1111-4111-8111-111111111111");
const SEGUNDA = operacion("22222222-2222-4222-8222-222222222222");

const encuesta = () => screen.queryByRole("dialog", { name: /Encuesta de cierre/ });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: null }), { status: 200 })),
  );
});

describe("la encuesta abierta no se la quita nadie", () => {
  it("que el servidor deje de proponerla no la cierra", () => {
    const { rerender } = render(<SurveyGate trade={PRIMERA} />);
    expect(encuesta()).toBeTruthy();

    // Esto es exactamente lo que pasaba al contestar: el panel se repinta y la
    // operación ya no es candidata.
    rerender(<SurveyGate trade={null} />);

    expect(encuesta()).toBeTruthy();
  });

  it("tampoco la cambia por otra a media contestación", () => {
    const { rerender } = render(<SurveyGate trade={PRIMERA} />);
    rerender(<SurveyGate trade={SEGUNDA} />);

    expect(screen.getByText(PRIMERA.productId)).toBeTruthy();
  });
});

describe("cerrarla sí la cierra", () => {
  it("y no vuelve a salir sola para la misma operación", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SurveyGate trade={PRIMERA} />);

    await user.click(screen.getByRole("button", { name: "Cerrar la encuesta" }));
    expect(encuesta()).toBeNull();

    // El servidor tarda un repintado en enterarse de que está cerrada. Volver
    // a abrirla entonces es cómo se enseña a cerrar sin leer.
    rerender(<SurveyGate trade={PRIMERA} />);
    expect(encuesta()).toBeNull();
  });

  it("pero la siguiente operación sí abre la suya", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SurveyGate trade={PRIMERA} />);

    await user.click(screen.getByRole("button", { name: "Cerrar la encuesta" }));
    rerender(<SurveyGate trade={SEGUNDA} />);

    await waitFor(() => expect(encuesta()).toBeTruthy());
  });
});

describe("sin candidata no hay cuadro", () => {
  it("no se pinta nada cuando no toca preguntar", () => {
    render(<SurveyGate trade={null} />);
    expect(encuesta()).toBeNull();
  });
});
