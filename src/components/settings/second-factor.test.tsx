// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecondFactor } from "./second-factor";

/**
 * Inscribir el segundo factor desde el teléfono: el QR no se puede escanear
 * con la cámara del aparato que lo enseña, así que hay un botón que abre la
 * app de códigos con el enlace `otpauth://`. Y «Cancelar» a medias quita el
 * factor sin verificar en vez de dejarlo colgado.
 */

const llamadas = vi.hoisted(() => ({ cancelar: [] as string[] }));

vi.mock("@/lib/auth/mfa-actions", () => ({
  startTotpEnrollment: async () => ({
    error: null,
    factorId: "f-1",
    qr: "data:image/svg+xml;utf8,<svg/>",
    secreto: "JBSWY3DPEHPK3PXP",
    uri: "otpauth://totp/Trading%20Registro:yo?secret=JBSWY3DPEHPK3PXP&issuer=Trading%20Registro",
  }),
  confirmTotpEnrollment: async () => ({ error: null }),
  removeTotpFactor: async () => ({ error: null }),
  cancelTotpEnrollment: async (id: string) => {
    llamadas.cancelar.push(id);
    return { error: null };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

beforeEach(() => {
  llamadas.cancelar = [];
});

describe("el segundo factor en Ajustes", () => {
  it("ofrece abrir la app de códigos en el mismo teléfono", async () => {
    const user = userEvent.setup();
    render(<SecondFactor factores={[]} />);
    await user.click(screen.getByRole("button", { name: "Activar con mi teléfono" }));
    const enlace = await screen.findByRole("link", { name: "Abrir en la app de códigos" });
    expect(enlace.getAttribute("href")).toMatch(/^otpauth:\/\/totp\//);
    expect(screen.getByAltText("Código QR para la app de códigos")).toBeInTheDocument();
  });

  it("«Cancelar» quita el factor a medias", async () => {
    const user = userEvent.setup();
    render(<SecondFactor factores={[]} />);
    await user.click(screen.getByRole("button", { name: "Activar con mi teléfono" }));
    await screen.findByRole("link", { name: "Abrir en la app de códigos" });
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(llamadas.cancelar).toEqual(["f-1"]));
    expect(screen.queryByRole("link", { name: "Abrir en la app de códigos" })).not.toBeInTheDocument();
  });
});
