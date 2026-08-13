// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { InfoHint } from "./info-hint";

/**
 * Simulates a real finger tap, not a mouse click. This matters: Radix's
 * tooltip opens on pointer *move* for a mouse, so a mouse-driven test
 * would pass even if touch were completely broken -- which is exactly the
 * bug this component exists to fix.
 */
async function tap(element: HTMLElement) {
  await userEvent.pointer([
    { keys: "[TouchA>]", target: element },
    { keys: "[/TouchA]", target: element },
  ]);
}

describe("InfoHint", () => {
  it("opens on tap -- the behavior touch users depend on", async () => {
    render(<InfoHint label="Profit factor">Ganancias divididas entre pérdidas.</InfoHint>);
    const trigger = screen.getByRole("button", { name: /profit factor/i });

    expect(screen.queryByText("Ganancias divididas entre pérdidas.")).not.toBeInTheDocument();

    await tap(trigger);

    expect(await screen.findByText("Ganancias divididas entre pérdidas.")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-state", "instant-open");
  });

  it("closes again on a second tap", async () => {
    render(<InfoHint label="Drawdown">La mayor caída.</InfoHint>);
    const trigger = screen.getByRole("button", { name: /drawdown/i });

    await tap(trigger);
    expect(await screen.findByText("La mayor caída.")).toBeInTheDocument();

    await tap(trigger);
    // Asserting on Radix's own state attribute rather than on the content
    // unmounting: its exit is animation-driven and jsdom never fires
    // animationend, so the node can linger in the DOM even when closed.
    expect(trigger).toHaveAttribute("data-state", "closed");
  });

  it("still opens on mouse hover, so desktop behavior is unchanged", async () => {
    render(<InfoHint label="Win rate">Porcentaje de aciertos.</InfoHint>);
    const trigger = screen.getByRole("button", { name: /win rate/i });

    await userEvent.hover(trigger);

    expect(await screen.findByText("Porcentaje de aciertos.")).toBeInTheDocument();
  });

  it("names itself for screen readers using the metric it explains", () => {
    render(<InfoHint label="Win rate">Porcentaje de aciertos.</InfoHint>);
    expect(screen.getByRole("button", { name: 'Qué significa "Win rate"' })).toBeInTheDocument();
  });
});
