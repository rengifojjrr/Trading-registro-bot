import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { DateTime } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";

import { todayIn } from "./today";
import { userTimezone } from "./user-settings";

/**
 * La tarjeta de WhatsApp: si el bot da señales y las cifras de su día.
 *
 * Sólo números y el estado del bot. Nunca el texto de un mensaje ni el nombre
 * de nadie: lo que el bot sube por el puente son cifras (`core_daily_metrics`,
 * módulo `whatsapp`) y su latido (`puente_clientes`). Lee las dos tablas por su
 * nombre, como `day.ts`, sin importar ningún módulo.
 */

/** Con un latido de hace menos de esto, el bot está «en línea». */
export const EN_LINEA_MIN = 10;

export interface LatidoDeCliente {
  cliente: string;
  visto_en: string | null;
  estado_en: string | null;
  dos_motores_en: string | null;
  panel_url: string | null;
  wa_conectado: boolean | null;
  version: string | null;
  donde: string | null;
}

export type SenalDelBot = "EN_LINEA" | "SIN_SENAL" | "NUNCA";

export interface EstadoDelBot {
  senal: SenalDelBot;
  /** La última vez que el bot habló (ISO), si alguna vez lo hizo. */
  ultimoLatido: string | null;
  waConectado: boolean | null;
  panelUrl: string | null;
  version: string | null;
  donde: string | null;
  /** Dos procesos del bot hablando a la vez (la Mac y el servidor), en la última hora. */
  dosMotores: boolean;
}

/** El estado del bot a partir de los latidos de sus clientes (puro, con pruebas). */
export function estadoDelBot(latidos: LatidoDeCliente[], ahora: Date): EstadoDelBot {
  const motores = latidos.filter((l) => l.cliente === "mac-1" || l.cliente === "vps-1");
  const cuando = (l: LatidoDeCliente) => Date.parse(l.estado_en ?? l.visto_en ?? "") || 0;
  const ultimo = [...motores].sort((a, b) => cuando(b) - cuando(a))[0];
  if (!ultimo || cuando(ultimo) === 0) {
    return { senal: "NUNCA", ultimoLatido: null, waConectado: null, panelUrl: null, version: null, donde: null, dosMotores: false };
  }
  const reciente = (iso: string | null, minutos: number) =>
    !!iso && ahora.getTime() - Date.parse(iso) < minutos * 60_000;
  const vivos = motores.filter((l) => reciente(l.estado_en, EN_LINEA_MIN));
  const enLinea = reciente(ultimo.estado_en ?? ultimo.visto_en, EN_LINEA_MIN);
  return {
    senal: enLinea ? "EN_LINEA" : "SIN_SENAL",
    ultimoLatido: new Date(cuando(ultimo)).toISOString(),
    // Sin señal no se sabe si WhatsApp sigue conectado: no se dice.
    waConectado: enLinea ? ultimo.wa_conectado : null,
    panelUrl: ultimo.panel_url,
    version: ultimo.version,
    donde: ultimo.donde,
    dosMotores: vivos.length > 1 || motores.some((l) => reciente(l.dos_motores_en, 60)),
  };
}

/** «hace 3 min», «desde las 23:10», «desde ayer 23:10», «desde el 3 oct». */
export function textoDelLatido(iso: string, ahora: Date, zona: string): string {
  const momento = DateTime.fromISO(iso, { zone: zona });
  const ya = DateTime.fromJSDate(ahora, { zone: zona });
  const minutos = Math.max(0, Math.round(ya.diff(momento, "minutes").minutes));
  if (minutos < 1) return "ahora mismo";
  if (minutos < 60) return `hace ${minutos} min`;
  const hora = momento.toFormat("HH:mm");
  if (momento.hasSame(ya, "day")) return `desde las ${hora}`;
  if (momento.hasSame(ya.minus({ days: 1 }), "day")) return `desde ayer ${hora}`;
  return `desde el ${momento.toFormat("d LLL")}`;
}

export interface CifrasDeWhatsApp {
  fecha: string | null;
  cifras: Partial<Record<string, number>>;
}

export interface TarjetaDeWhatsApp {
  bot: EstadoDelBot;
  /** El texto del latido ya hecho en la zona del dueño. */
  latido: string | null;
  hoy: CifrasDeWhatsApp;
  zona: string;
}

/** Lo que pinta la tarjeta: el latido y las cifras de hoy (o del último día que hubo). */
export async function leerTarjetaDeWhatsApp(ahora: Date = new Date()): Promise<TarjetaDeWhatsApp> {
  const user = await requireUser();
  const supabase = await createClient();
  const zona = await userTimezone();
  const [{ data: latidos }, { data: cifras }] = await Promise.all([
    supabase
      .from("puente_clientes")
      .select("cliente, visto_en, estado_en, dos_motores_en, panel_url, wa_conectado, version, donde")
      .eq("user_id", user.id),
    supabase
      .from("core_daily_metrics")
      .select("metric_date, metric_key, value")
      .eq("user_id", user.id)
      .eq("module", "whatsapp")
      .order("metric_date", { ascending: false })
      .limit(20),
  ]);
  const bot = estadoDelBot((latidos ?? []) as LatidoDeCliente[], ahora);
  const filas = cifras ?? [];
  const fecha = filas[0]?.metric_date ?? null;
  const hoy: CifrasDeWhatsApp = {
    fecha,
    cifras: Object.fromEntries(filas.filter((f) => f.metric_date === fecha).map((f) => [f.metric_key, Number(f.value)])),
  };
  return {
    bot,
    latido: bot.ultimoLatido ? textoDelLatido(bot.ultimoLatido, ahora, zona) : null,
    hoy,
    zona,
  };
}

/** ¿Las cifras son de hoy? Si la Mac lleva días dormida, son de otro día y se dice. */
export function cifrasDeHoy(t: TarjetaDeWhatsApp, ahora: Date = new Date()): boolean {
  return t.hoy.fecha === todayIn(t.zona, ahora);
}

/** Un enlace al panel de la Mac. Sólo la dirección que mandó el bot y un destino de la lista. */
export function enlaceAlPanel(panelUrl: string | null, ir?: "mapa" | "reuniones" | "salud" | "bot"): string | null {
  if (!panelUrl || !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/-]*)?$/.test(panelUrl)) return null;
  const base = panelUrl.replace(/\/+$/, "");
  return ir ? `${base}/?ir=${ir}` : `${base}/`;
}
