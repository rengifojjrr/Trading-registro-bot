// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ToolPalette } from "./tool-palette";
import { toolsByGroup } from "@/lib/charts/tools";

/**
 * La barra de canto, como la de TradingView.
 *
 * Lo que hay que no perder: un botón por familia que aplica su herramienta de
 * un clic, y una lista aparte para cambiar de herramienta dentro de la familia.
 * Antes eran pestañas y una rejilla de cuarenta y seis iconos encima del
 * gráfico, y elegir era reconocer un dibujo de veinte píxeles sin nombre.
 *
 * jsdom no tiene contexto 2D, así que las miniaturas salen en blanco. Da igual:
 * lo que se prueba aquí es a qué lleva cada botón, no lo que dibuja -- eso lo
 * cubren los tests de `preview.ts` y las capturas en un navegador de verdad.
 */
describe("ToolPalette", () => {
  it("un botón por familia, ni uno más", () => {
    render(<ToolPalette active={null} onSelect={() => {}} />);

    const familias = toolsByGroup();
    const desplegar = screen.getAllByRole("button", { name: /^Ver las herramientas de/ });

    expect(desplegar).toHaveLength(familias.length);
  });

  it("el botón de la familia pone su herramienta de un clic, sin abrir nada", async () => {
    const onSelect = vi.fn();
    render(<ToolPalette active={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /^Líneas:/ }));

    expect(onSelect).toHaveBeenCalledWith("TRENDLINE");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("la flecha abre la lista de esa familia, con nombres", async () => {
    render(<ToolPalette active={null} onSelect={() => {}} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Ver las herramientas de fibonacci y gann" }),
    );

    const menu = screen.getByRole("menu", { name: "Fibonacci y Gann" });
    expect(within(menu).getByText("Retroceso de Fibonacci")).toBeInTheDocument();
    expect(within(menu).getByText("Horquilla de Andrews")).toBeInTheDocument();
    // Sin mezclar familias: la lista es de una sola.
    expect(within(menu).queryByText("Rectángulo")).toBeNull();
  });

  it("la familia recuerda lo último que elegiste en ella", async () => {
    const onSelect = vi.fn();
    render(<ToolPalette active={null} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Ver las herramientas de fibonacci y gann" }),
    );
    await userEvent.click(screen.getByText("Círculos de Fibonacci"));
    expect(onSelect).toHaveBeenLastCalledWith("FIB_CIRCLE");

    // Y ahora el botón de la familia vuelve a poner ésa, no la primera de la
    // lista: se dibujan seis seguidas, y abrir la lista cada vez son tres
    // clics en vez de uno.
    await userEvent.click(screen.getByRole("button", { name: /^Fibonacci y Gann:/ }));
    expect(onSelect).toHaveBeenLastCalledWith("FIB_CIRCLE");
  });

  it("elegir de la lista la cierra", async () => {
    render(<ToolPalette active={null} onSelect={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /^Ver las herramientas de líneas/ }));
    await userEvent.click(screen.getByText("Rayo"));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape cierra la lista sin elegir nada", async () => {
    const onSelect = vi.fn();
    render(<ToolPalette active={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /^Ver las herramientas de líneas/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("la familia de la herramienta activa se ve pulsada y enseña esa herramienta", () => {
    render(<ToolPalette active="FIB_FAN" onSelect={() => {}} />);

    const boton = screen.getByRole("button", { name: "Fibonacci y Gann: Abanico de Fibonacci" });
    expect(boton).toHaveAttribute("aria-pressed", "true");

    // Y ninguna otra: sólo hay una herramienta puesta a la vez.
    const pulsados = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pulsados).toHaveLength(1);
  });

  it("una sola lista abierta a la vez", async () => {
    render(<ToolPalette active={null} onSelect={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /^Ver las herramientas de líneas/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Ver las herramientas de figuras/ }));

    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu")).toHaveAccessibleName("Figuras");
  });
});
