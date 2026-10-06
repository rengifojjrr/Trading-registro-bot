// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/core/whatsapp", async () => {
  const real = await vi.importActual<typeof import("@/core/whatsapp")>("@/core/whatsapp");
  return { ...real, leerTarjetaDeWhatsApp: async () => null };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => ({ id: "u" }) }));
vi.mock("@/core/user-settings", () => ({ userTimezone: async () => "UTC" }));

import type { TarjetaDeWhatsApp } from "@/core/whatsapp";

import { WhatsAppTileVista } from "./whatsapp-tile";

/** La tarjeta de WhatsApp en Hoy: cifras y un punto con su texto. Ningún nombre. */

const tarjeta = (extra: Partial<TarjetaDeWhatsApp> = {}): TarjetaDeWhatsApp => ({
  bot: { senal: "EN_LINEA", ultimoLatido: "2026-10-06T16:00:00Z", waConectado: true, panelUrl: null, version: null, donde: "MAC", dosMotores: false },
  latido: "hace 2 min",
  hoy: { fecha: new Date().toISOString().slice(0, 10), cifras: { chats_esperando: 3, tomados: 1 } },
  zona: "UTC",
  ...extra,
});

describe("WhatsAppTileVista", () => {
  it("en línea, con lo que espera y lo tomado", () => {
    render(<WhatsAppTileVista tarjeta={tarjeta()} />);
    expect(screen.getByText("3 por atender · 1 tomado")).toBeInTheDocument();
    expect(screen.getByText("Bot en línea")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/whatsapp");
  });

  it("sin señal: lo dice con el texto, no sólo con el color", () => {
    render(<WhatsAppTileVista tarjeta={tarjeta({ bot: { ...tarjeta().bot, senal: "SIN_SENAL" }, latido: "desde las 23:10" })} />);
    expect(screen.getByText("Sin señal desde las 23:10")).toBeInTheDocument();
  });

  it("sin conectar nunca, ni cifras", () => {
    render(<WhatsAppTileVista tarjeta={null} />);
    expect(screen.getByText("Sin conectar")).toBeInTheDocument();
    expect(screen.getByText("Sin cifras todavía")).toBeInTheDocument();
  });

  it("cifras de otro día: se dice", () => {
    render(<WhatsAppTileVista tarjeta={tarjeta({ hoy: { fecha: "2026-01-01", cifras: { chats_esperando: 0 } } })} />);
    expect(screen.getByText("(de otro día)")).toBeInTheDocument();
  });
});
