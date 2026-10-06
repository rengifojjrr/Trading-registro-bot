// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownView } from "./markdown-view";

/**
 * La ficha técnica la escribe Claude (o quien escriba el archivo) y se pinta
 * aquí. Sólo se enlaza lo que es http(s): un `javascript:` o un `data:` se
 * queda como texto, nunca como enlace. Y el HTML incrustado es texto.
 */
describe("la ficha con formato", () => {
  it("enlaza http(s)", () => {
    render(<MarkdownView source={"Mira [los planos](https://ejemplo.test/p.pdf) y https://ejemplo.test/b"} />);
    const enlaces = screen.getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual(["https://ejemplo.test/p.pdf", "https://ejemplo.test/b"]);
    for (const a of enlaces) expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it.each([
    "[pulsa](javascript:alert(1))",
    "[pulsa](JAVASCRIPT:alert(1))",
    "[pulsa](data:text/html;base64,PHNjcmlwdD4=)",
    "[pulsa](vbscript:msgbox)",
    "[pulsa](//otra.web/x)",
  ])("no enlaza %s", (texto) => {
    const { container } = render(<MarkdownView source={texto} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("pulsa");
  });

  it("el HTML incrustado se queda como texto", () => {
    const { container } = render(<MarkdownView source={'<img src=x onerror="alert(1)"> <script>alert(1)</script>'} />);
    expect(container.querySelector("img, script")).toBeNull();
    expect(container.textContent).toContain("<script>");
  });
});
