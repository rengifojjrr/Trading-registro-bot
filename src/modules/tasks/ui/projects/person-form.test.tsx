// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PersonRow } from "@/modules/tasks/project-queries";

import { PersonForm } from "./person-form";

/**
 * Lo que sabes de una persona. Una persona sin datos no puede parecer que los
 * tiene: nada de ejemplos que se lean como datos, y lo escrito en el color del
 * texto. Al renombrarla, su nombre de antes aparece en «Otros nombres».
 */

const llamadas = vi.hoisted(() => ({ update: [] as unknown[] }));

vi.mock("@/modules/tasks/project-actions", () => ({
  updatePerson: async (_id: string, patch: unknown) => {
    llamadas.update.push(patch);
    return { error: null, aliases: ["Lucía"] };
  },
  setPersonArchived: async () => ({ error: null }),
}));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const VACIA: PersonRow = {
  id: "00000000-0000-7000-8000-000000000002",
  name: "Lucía",
  aliases: [],
  is_owner: false,
  relation: null,
  org: null,
  circle: null,
  note: null,
  has_whatsapp: false,
  whatsapp_hint: null,
  phone_tail: null,
  color: null,
  archived_at: null,
  field_src: {},
  created_at: "2026-10-01T00:00:00Z",
};

describe("la ficha de una persona", () => {
  it("sin datos, ningún campo enseña algo que parezca un dato", () => {
    const { container } = render(<PersonForm person={VACIA} />);
    for (const campo of container.querySelectorAll("input, textarea")) {
      const ejemplo = campo.getAttribute("placeholder");
      if (ejemplo) expect(ejemplo).toMatch(/^p\. ej\./);
    }
    expect(screen.queryByPlaceholderText("…1234")).not.toBeInTheDocument();
  });

  it("lo escrito va en el color del texto, no en el gris de la etiqueta", () => {
    render(<PersonForm person={VACIA} />);
    expect(screen.getByLabelText("Quién es")).toHaveClass("text-foreground");
    expect(screen.getByLabelText("Tu nota")).toHaveClass("text-foreground");
  });

  it("al renombrarla, el nombre de antes queda en «Otros nombres»", async () => {
    const user = userEvent.setup();
    render(<PersonForm person={VACIA} />);
    const nombre = screen.getByLabelText("Cómo le dices");
    await user.clear(nombre);
    await user.type(nombre, "Lucía Prado");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByLabelText("Otros nombres (separados por comas)")).toHaveValue("Lucía"));
    expect(llamadas.update[0]).toMatchObject({ name: "Lucía Prado" });
  });
});
