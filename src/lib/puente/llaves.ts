import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

import { CLIENTES, PREFIJO_LLAVE, sha256Hex, type ClientePuente } from "./firma";

/**
 * Las llaves del puente: una por cliente, rotables y revocables una a una.
 *
 * La base no guarda la llave. Guarda su sal y su huella, y la llave se vuelve a
 * **derivar** en cada petición con la clave de servicio de Supabase, que sólo
 * vive en las variables de Vercel (y en el servidor que la usa para todo lo
 * demás). Con una copia de `puente_llaves` no se puede firmar nada; quien tiene
 * la clave de servicio ya lo tiene todo, así que no se le da nada nuevo.
 *
 * Así no hace falta ninguna variable de entorno nueva en Vercel: crear, rotar y
 * revocar se hace desde Ajustes con la sesión del dueño.
 *
 * Si algún día cambia la clave de servicio (Supabase migra a las llaves
 * `sb_secret_…`), la derivación deja de dar la misma huella y las llaves de
 * antes dejan de valer: el bot lo dice en Salud y se crean otras.
 */

/** Dos vivas a la vez por cliente: la nueva entra antes de quitar la vieja. */
export const LLAVES_VIVAS_MAX = 2;

/** Lo que entra en la derivación aparte de la clave de servicio. Nunca se usa ésta tal cual. */
export function pimientaDe(claveDeServicio: string): Buffer {
  return createHmac("sha256", Buffer.from(claveDeServicio, "utf8")).update("puente-pimienta-v1", "utf8").digest();
}

export function derivarLlave(pimienta: Buffer, llaveId: string, sal: string): string {
  const mac = createHmac("sha256", pimienta).update(`puente-llave-v1|${llaveId}|${sal}`, "utf8").digest("base64url");
  return `${PREFIJO_LLAVE}${mac}`;
}

export function huellaDeLlave(llave: string): string {
  return sha256Hex(llave);
}

export function mismaHuella(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function pimienta(): Buffer | null {
  const clave = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  return clave ? pimientaDe(clave) : null;
}

export interface LlaveViva {
  id: string;
  userId: string;
  llave: string;
}

/**
 * Las llaves vivas de un cliente, ya derivadas, para comprobar una firma. Las
 * que no dan su huella (cambió la clave de servicio) no se devuelven.
 */
export async function llavesVivas(cliente: ClientePuente): Promise<LlaveViva[]> {
  const p = pimienta();
  if (!p) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("puente_llaves")
    .select("id, user_id, sal, huella")
    .eq("cliente", cliente)
    .is("revocada_en", null)
    .order("creada_en", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  const vivas: LlaveViva[] = [];
  for (const fila of data) {
    const llave = derivarLlave(p, fila.id, fila.sal);
    if (mismaHuella(huellaDeLlave(llave), fila.huella)) vivas.push({ id: fila.id, userId: fila.user_id, llave });
  }
  return vivas;
}

export interface LlaveVisible {
  id: string;
  cliente: ClientePuente;
  etiqueta: string | null;
  creadaEn: string;
  usadaEn: string | null;
  revocadaEn: string | null;
  /** La huella sigue saliendo igual con la clave de servicio de ahora. */
  vale: boolean;
}

/** Las llaves de un usuario para Ajustes: nunca la llave, sólo cuándo y si vale. */
export async function llavesDe(userId: string): Promise<LlaveVisible[]> {
  const p = pimienta();
  const admin = createAdminClient();
  const { data } = await admin
    .from("puente_llaves")
    .select("id, cliente, sal, huella, etiqueta, creada_en, usada_en, revocada_en")
    .eq("user_id", userId)
    .order("creada_en", { ascending: false })
    .limit(30);
  return (data ?? []).map((f) => ({
    id: f.id,
    cliente: f.cliente as ClientePuente,
    etiqueta: f.etiqueta,
    creadaEn: f.creada_en,
    usadaEn: f.usada_en,
    revocadaEn: f.revocada_en,
    vale: !!p && mismaHuella(huellaDeLlave(derivarLlave(p, f.id, f.sal)), f.huella),
  }));
}

/**
 * Una llave nueva para un cliente. La llave sale UNA vez, aquí; después sólo
 * se puede revocar. Con dos vivas, hay que revocar una antes.
 */
export async function crearLlaveDe(
  userId: string,
  cliente: ClientePuente,
): Promise<{ error: string | null; llave: string | null }> {
  if (!(CLIENTES as readonly string[]).includes(cliente)) return { error: "Ese cliente no existe.", llave: null };
  const p = pimienta();
  if (!p) return { error: "Falta la clave de servicio en el servidor.", llave: null };
  const admin = createAdminClient();
  const { count } = await admin
    .from("puente_llaves")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("cliente", cliente)
    .is("revocada_en", null);
  if ((count ?? 0) >= LLAVES_VIVAS_MAX) {
    return { error: `Ya hay ${LLAVES_VIVAS_MAX} llaves vivas para ${cliente}: revoca una antes.`, llave: null };
  }
  const id = crypto.randomUUID();
  const sal = randomBytes(24).toString("hex");
  const llave = derivarLlave(p, id, sal);
  const { error } = await admin.from("puente_llaves").insert({
    id,
    user_id: userId,
    cliente,
    sal,
    huella: huellaDeLlave(llave),
  });
  if (error) return { error: "No se pudo crear la llave.", llave: null };
  return { error: null, llave };
}

export async function revocarLlaveDe(userId: string, llaveId: string): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("puente_llaves")
    .update({ revocada_en: new Date().toISOString() })
    .eq("id", llaveId)
    .eq("user_id", userId)
    .is("revocada_en", null);
  return { error: error ? "No se pudo revocar." : null };
}
