// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/settings/actions", () => ({
  adoptTimezone: vi.fn(async () => ({ error: null })),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TimezoneMismatchNotice } from "./timezone-mismatch-notice";

/** La zona real del entorno de pruebas: contra ella se compara el componente. */
const DEL_ENTORNO = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("TimezoneMismatchNotice", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("avisa cuando la zona guardada no es la del dispositivo", async () => {
    // El caso real: la configuración nace en UTC y nadie la cambia, así que
    // todas las horas de la aplicación salen desplazadas sin decirlo.
    const otra = DEL_ENTORNO === "America/Bogota" ? "Asia/Tokyo" : "America/Bogota";
    render(<TimezoneMismatchNotice configured={otra} />);

    expect(await screen.findByText(/no son las tuyas/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Usar ${DEL_ENTORNO}` })).toBeInTheDocument();
  });

  it("no dice nada cuando ya coinciden", () => {
    const { container } = render(<TimezoneMismatchNotice configured={DEL_ENTORNO} />);
    // Un aviso que sale cuando no hay problema enseña a ignorar los que sí.
    expect(container).toBeEmptyDOMElement();
  });

  it("una vez descartado para esa zona, no vuelve", () => {
    window.localStorage.setItem("timezone-mismatch.dismissed", DEL_ENTORNO);
    const { container } = render(<TimezoneMismatchNotice configured="Asia/Tokyo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("descartado en otro sitio, vuelve a preguntar aquí", async () => {
    // El descarte se guarda contra la zona detectada: si cambias de país, la
    // pregunta es nueva.
    window.localStorage.setItem("timezone-mismatch.dismissed", "Europe/Madrid");
    render(<TimezoneMismatchNotice configured="Asia/Tokyo" />);
    expect(await screen.findByText(/no son las tuyas/i)).toBeInTheDocument();
  });
});
