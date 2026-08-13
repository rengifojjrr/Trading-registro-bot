// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "./collapsible-section";

/**
 * Visibility here is driven by Tailwind's `hidden` utility, and jsdom has
 * no stylesheet loaded, so `toBeVisible()` would report every node as
 * visible regardless of its classes. These assertions therefore check the
 * class the component actually applies. The rendered result is verified
 * for real in the Playwright pass, which runs against a real browser with
 * real CSS.
 */
function bodyOf(text: string): HTMLElement {
  const node = screen.getByText(text).parentElement;
  if (!node) throw new Error(`No wrapper found around "${text}"`);
  return node;
}

describe("CollapsibleSection", () => {
  it("hides its body until opened", async () => {
    render(
      <CollapsibleSection title="Más estadísticas">
        <p>contenido oculto</p>
      </CollapsibleSection>,
    );

    expect(bodyOf("contenido oculto")).toHaveClass("hidden");

    await userEvent.click(screen.getByRole("button", { name: /más estadísticas/i }));
    expect(bodyOf("contenido oculto")).not.toHaveClass("hidden");
  });

  it("can start open", () => {
    render(
      <CollapsibleSection title="Detalle" defaultOpen>
        <p>ya visible</p>
      </CollapsibleSection>,
    );
    expect(bodyOf("ya visible")).not.toHaveClass("hidden");
  });

  it("closes again on a second click", async () => {
    render(
      <CollapsibleSection title="Detalle" defaultOpen>
        <p>alternante</p>
      </CollapsibleSection>,
    );

    await userEvent.click(screen.getByRole("button", { name: /detalle/i }));
    expect(bodyOf("alternante")).toHaveClass("hidden");
  });

  it("reports its state to assistive tech via aria-expanded", async () => {
    render(
      <CollapsibleSection title="Filtros">
        <p>campos</p>
      </CollapsibleSection>,
    );

    const trigger = screen.getByRole("button", { name: /filtros/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the body open at desktop widths when alwaysOpenOnDesktop is set", () => {
    render(
      <CollapsibleSection title="Filtros" alwaysOpenOnDesktop>
        <p>campos</p>
      </CollapsibleSection>,
    );

    // Closed on small screens, but md:block overrides that from md up --
    // the whole point of the flag, and the reason it can't be a JS
    // breakpoint check (that would flicker and break hydration).
    const body = bodyOf("campos");
    expect(body).toHaveClass("hidden");
    expect(body).toHaveClass("md:block");
  });

  it("shows the badge and subtitle when given", () => {
    render(
      <CollapsibleSection title="Filtros" badge="3" subtitle="Cuenta, producto y fechas">
        <p>campos</p>
      </CollapsibleSection>,
    );

    expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
    expect(screen.getByText("Cuenta, producto y fechas")).toBeInTheDocument();
  });
});
