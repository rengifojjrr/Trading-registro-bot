// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkJournalDialog } from "./bulk-journal-dialog";
import { HTF_BIAS_OPTIONS, SR_PROXIMITY_OPTIONS } from "@/lib/journal/options";
import { SETUP_GRADES } from "@/lib/journal/setup-grade";

/**
 * Apuntar varias operaciones tiene que preguntar lo mismo que apuntar una.
 *
 * Faltaban la nota del setup, el sesgo, dónde estaba el precio, la dirección
 * planeada y la calidad de entrada: preguntas que sólo se podían contestar de
 * una en una, así que en una ráfaga de doce entradas -- que es justo cuando se
 * usa este cuadro -- se quedaban sin contestar para siempre.
 */

const aplicar = vi.fn();
const listar = vi.fn();

vi.mock("@/app/(dashboard)/trades/bulk-journal-actions", () => ({
  applyJournalToTrades: (...args: unknown[]) => aplicar(...args),
}));

vi.mock("@/app/(dashboard)/trades/template-actions", () => ({
  listJournalTemplates: () => listar(),
  markTemplateUsed: vi.fn(),
  saveJournalTemplate: vi.fn(),
}));

function abrir() {
  return render(
    <BulkJournalDialog
      tradeIds={["11111111-1111-4111-8111-111111111111"]}
      strategies={[{ id: "22222222-2222-4222-8222-222222222222", name: "Ruptura de rango" }]}
      onClose={() => {}}
      onApplied={() => {}}
    />,
  );
}

/** Lo que el cuadro mandaría al servidor con lo que hay marcado ahora mismo. */
async function ultimoEnvio() {
  await waitFor(() => expect(aplicar).toHaveBeenCalled());
  return aplicar.mock.calls[aplicar.mock.calls.length - 1][0] as {
    values: Record<string, unknown>;
  };
}

describe("BulkJournalDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    listar.mockResolvedValue([]);
    aplicar.mockResolvedValue({ error: null, plan: null, applied: false });
  });

  it("pregunta la nota del setup, que antes había que poner de una en una", async () => {
    abrir();

    const setup = screen.getByRole("group", { name: "Setup" });
    for (const grade of SETUP_GRADES) {
      expect(within(setup).getByRole("button", { name: grade }), grade).toBeTruthy();
    }
  });

  it("pregunta también el sesgo, la proximidad y la dirección planeada", () => {
    abrir();

    const sesgo = screen.getByLabelText("Sesgo de temporalidad alta");
    for (const opcion of HTF_BIAS_OPTIONS) {
      expect(within(sesgo).getByRole("option", { name: opcion }), opcion).toBeTruthy();
    }

    const proximidad = screen.getByLabelText("Proximidad a soporte/resistencia");
    for (const opcion of SR_PROXIMITY_OPTIONS) {
      expect(within(proximidad).getByRole("option", { name: opcion }), opcion).toBeTruthy();
    }

    const direccion = screen.getByRole("group", { name: "Dirección planeada" });
    expect(within(direccion).getByRole("button", { name: "Long" })).toBeTruthy();
    expect(within(direccion).getByRole("button", { name: "Short" })).toBeTruthy();
  });

  it("pregunta las dos puntuaciones, no sólo la adherencia", () => {
    abrir();

    expect(screen.getByRole("group", { name: "Adherencia al plan" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Calidad de entrada" })).toBeTruthy();
  });

  it("manda al servidor lo que se marca, y sólo eso", async () => {
    abrir();

    const setup = screen.getByRole("group", { name: "Setup" });
    await userEvent.click(within(setup).getByRole("button", { name: "A+" }));

    const { values } = await ultimoEnvio();

    expect(values.setup_grade).toBe("A+");
    // Nada más marcado: lo que no se toca no viaja, y lo que no viaja no se
    // escribe -- es lo que hace que este cuadro no pueda borrar el diario.
    expect(Object.keys(values)).toEqual(["setup_grade"]);
  });

  it("se puede quitar lo marcado volviendo a pulsarlo", async () => {
    abrir();

    const setup = screen.getByRole("group", { name: "Setup" });
    const boton = within(setup).getByRole("button", { name: "B" });

    await userEvent.click(boton);
    expect(boton).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(boton);
    expect(boton).toHaveAttribute("aria-pressed", "false");
  });

  it("una sola nota de setup a la vez", async () => {
    abrir();

    const setup = screen.getByRole("group", { name: "Setup" });
    await userEvent.click(within(setup).getByRole("button", { name: "A+" }));
    await userEvent.click(within(setup).getByRole("button", { name: "C" }));

    expect(within(setup).getByRole("button", { name: "A+" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(within(setup).getByRole("button", { name: "C" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("los desplegables empiezan en «sin cambiar»", () => {
    // Es lo que hace que abrir el cuadro y guardar no toque nada: el valor de
    // partida significa «no toques este campo», no «pon vacío».
    abrir();

    expect(screen.getByLabelText("Sesgo de temporalidad alta")).toHaveValue("");
    expect(screen.getByLabelText("Proximidad a soporte/resistencia")).toHaveValue("");
    expect(screen.getByLabelText("Estrategia")).toHaveValue("");
  });

  it("con nada marcado no consulta nada y no deja guardar", () => {
    abrir();

    expect(aplicar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Apuntar 1$/ })).toBeDisabled();
    expect(screen.getByText(/Marca al menos un campo/)).toBeTruthy();
  });

  it("sigue sin ofrecer el stop, el objetivo ni el riesgo", () => {
    // No es un olvido: son números de cada operación, y ponerle el mismo stop
    // a doce entradas distintas no es cómodo, es falso.
    abrir();

    expect(screen.queryByLabelText(/stop/i)).toBeNull();
    expect(screen.queryByLabelText(/take profit/i)).toBeNull();
    expect(screen.queryByLabelText(/arriesg/i)).toBeNull();
    expect(screen.queryByLabelText(/resultado en r/i)).toBeNull();
  });
});
