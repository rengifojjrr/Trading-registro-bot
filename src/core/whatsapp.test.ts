import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: async () => ({ id: "u" }) }));
vi.mock("./user-settings", () => ({ userTimezone: async () => "America/New_York" }));

import { enlaceAlPanel, estadoDelBot, textoDelLatido, type LatidoDeCliente } from "./whatsapp";

/**
 * La tarjeta de WhatsApp: el bot «en línea» con un latido de hace menos de
 * diez minutos; si no, «sin señal desde…». Claude no cuenta como bot.
 */

const AHORA = new Date("2026-10-06T16:00:00Z");
const latido = (cliente: string, haceMin: number, extra: Partial<LatidoDeCliente> = {}): LatidoDeCliente => ({
  cliente,
  visto_en: new Date(AHORA.getTime() - haceMin * 60_000).toISOString(),
  estado_en: new Date(AHORA.getTime() - haceMin * 60_000).toISOString(),
  dos_motores_en: null,
  panel_url: "https://panel.ejemplo.test",
  wa_conectado: true,
  version: "wa-core-2",
  donde: "MAC",
  ...extra,
});

describe("estadoDelBot", () => {
  it("nunca habló: NUNCA", () => {
    expect(estadoDelBot([], AHORA).senal).toBe("NUNCA");
    expect(estadoDelBot([latido("claude-1", 1)], AHORA).senal).toBe("NUNCA");
  });

  it("latido reciente: en línea, con WhatsApp y su panel", () => {
    const e = estadoDelBot([latido("mac-1", 3)], AHORA);
    expect(e).toMatchObject({ senal: "EN_LINEA", waConectado: true, panelUrl: "https://panel.ejemplo.test", dosMotores: false });
  });

  it("latido viejo: sin señal, y no se afirma nada de WhatsApp", () => {
    const e = estadoDelBot([latido("mac-1", 45)], AHORA);
    expect(e).toMatchObject({ senal: "SIN_SENAL", waConectado: null });
    expect(e.ultimoLatido).toBe("2026-10-06T15:15:00.000Z");
  });

  it("la Mac y el servidor a la vez: dos motores", () => {
    expect(estadoDelBot([latido("mac-1", 2), latido("vps-1", 4, { donde: "SERVIDOR" })], AHORA).dosMotores).toBe(true);
    expect(estadoDelBot([latido("mac-1", 300), latido("vps-1", 4, { donde: "SERVIDOR" })], AHORA)).toMatchObject({
      dosMotores: false,
      donde: "SERVIDOR",
    });
  });

  it("el vaivén de arranques con la misma llave también", () => {
    const vaiven = latido("mac-1", 2, { dos_motores_en: new Date(AHORA.getTime() - 20 * 60_000).toISOString() });
    expect(estadoDelBot([vaiven], AHORA).dosMotores).toBe(true);
  });
});

describe("textoDelLatido", () => {
  const zona = "America/New_York";
  it("minutos, hoy, ayer y otro día", () => {
    expect(textoDelLatido("2026-10-06T15:59:40Z", AHORA, zona)).toBe("ahora mismo");
    expect(textoDelLatido("2026-10-06T15:47:00Z", AHORA, zona)).toBe("hace 13 min");
    expect(textoDelLatido("2026-10-06T13:10:00Z", AHORA, zona)).toBe("desde las 09:10");
    expect(textoDelLatido("2026-10-06T03:10:00Z", AHORA, zona)).toBe("desde ayer 23:10");
    expect(textoDelLatido("2026-10-03T15:00:00Z", AHORA, zona)).toMatch(/^desde el 3 oct/);
  });
});

describe("enlaceAlPanel", () => {
  it("sólo https y sólo los destinos de la lista", () => {
    expect(enlaceAlPanel("https://panel.ejemplo.test/")).toBe("https://panel.ejemplo.test/");
    expect(enlaceAlPanel("https://panel.ejemplo.test", "mapa")).toBe("https://panel.ejemplo.test/?ir=mapa");
    expect(enlaceAlPanel("http://panel.ejemplo.test")).toBeNull();
    expect(enlaceAlPanel("https://panel.ejemplo.test/?k=abc")).toBeNull();
    expect(enlaceAlPanel("javascript:alert(1)")).toBeNull();
    expect(enlaceAlPanel(null)).toBeNull();
  });
});
