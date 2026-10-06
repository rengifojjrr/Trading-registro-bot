// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallosDeAccesibilidad } from "@/test-support/axe";

import { ImportFromClaude } from "./import-from-claude";

/**
 * «Importar desde Claude», en la pantalla.
 *
 * Lo que importa aquí es el orden: nada sale del navegador hasta que el lector
 * lo ha entendido; un archivo privado se para antes de mandar nada; y «Crear»
 * manda la huella del plan que se vio, no otra.
 */

const llamadas = vi.hoisted(() => ({
  plan: [] as unknown[],
  aplicar: [] as { archivo: unknown; huella: string }[],
  push: [] as string[],
}));

const PLAN = {
  proyectoId: "11111111-1111-7111-8111-111111111111",
  nombre: "Finca El Roble",
  nuevo: true,
  lineas: [
    "Finca El Roble (nuevo)",
    "Personas: 2 (1 nueva: Lucía)",
    "Frentes: 0 · Etapas: 0 · Hitos: 0 · Tareas: 1 · Bitácora: 0 · Enlaces: 0",
    "Cambia: nada · Se borra: nada",
  ],
  cambios: [],
  seQueda: [],
  noSeBorra: [],
  avisos: [],
  bloqueo: null,
  cuentas: {},
  huella: "abcdef0123456789",
  operaciones: 4,
};

vi.mock("@/modules/tasks/project-actions", () => ({
  planProjectImport: async (archivo: unknown) => {
    llamadas.plan.push(archivo);
    return { error: null, plan: PLAN };
  },
  applyProjectImport: async (archivo: unknown, huella: string) => {
    llamadas.aplicar.push({ archivo, huella });
    return { error: null, projectId: PLAN.proyectoId, plan: null, cambiado: false };
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (url: string) => llamadas.push.push(url) }),
}));

vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {}, message: () => {} } }));

const ARCHIVO = `---
proyecto: Finca El Roble
---
## Personas
| Persona | Papel |
|---|---|
| Yo | Coordinador |
| Lucía | Arquitecta |

## Tareas
- [ ] Llamar a Lucía — @yo
`;

beforeEach(() => {
  llamadas.plan = [];
  llamadas.aplicar = [];
  llamadas.push = [];
});

describe("Importar desde Claude", () => {
  it("lee en el navegador, enseña «Así lo entendí» y crea con la huella de lo que se vio", async () => {
    const user = userEvent.setup();
    render(<ImportFromClaude />);

    await user.click(screen.getByLabelText("El archivo del proyecto"));
    await user.paste(ARCHIVO);
    await user.click(screen.getByRole("button", { name: "Ver qué va a hacer" }));

    await screen.findByText("Así lo entendí");
    expect(screen.getByText("Personas: 2 (1 nueva: Lucía)")).toBeInTheDocument();
    expect(screen.getByText("Cambia: nada · Se borra: nada")).toBeInTheDocument();

    // Lo que se mandó al servidor es lo que entendió el lector, no el texto.
    expect(llamadas.plan).toHaveLength(1);
    expect(llamadas.plan[0]).toMatchObject({ nombre: "Finca El Roble", tareas: [{ titulo: "Llamar a Lucía", responsable: "yo" }] });

    await user.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(llamadas.aplicar).toHaveLength(1));
    expect(llamadas.aplicar[0].huella).toBe(PLAN.huella);
    expect(llamadas.aplicar[0].archivo).toBe(llamadas.plan[0]);
    await waitFor(() => expect(llamadas.push).toEqual([`/tareas/proyectos/${PLAN.proyectoId}`]));
  });

  it("un archivo .privado se para al elegirlo: no se lee ni se manda nada", async () => {
    const user = userEvent.setup();
    render(<ImportFromClaude />);
    const archivo = new File([ARCHIVO], "finca.privado.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText("Elegir archivo"), archivo);
    expect(await screen.findByRole("alert")).toHaveTextContent("nunca sube a la app");
    expect(screen.getByRole("button", { name: "Ver qué va a hacer" })).toBeDisabled();
    expect(llamadas.plan).toEqual([]);
  });

  it("si el lector no lo entiende, lo dice y no manda nada", async () => {
    const user = userEvent.setup();
    render(<ImportFromClaude />);
    await user.click(screen.getByLabelText("El archivo del proyecto"));
    await user.paste("## Tareas\n- [ ] algo sin proyecto\n");
    await user.click(screen.getByRole("button", { name: "Ver qué va a hacer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No encuentro el nombre del proyecto");
    expect(llamadas.plan).toEqual([]);
  });

  it("es accesible", async () => {
    const { container } = render(<ImportFromClaude />);
    expect(await fallosDeAccesibilidad(container)).toEqual([]);
  });
});
