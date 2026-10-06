import "server-only";

import { generateKeyPairSync } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Las claves VAPID de los avisos al teléfono: de dónde salen.
 *
 * 1. De las variables de entorno (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
 *    `VAPID_SUBJECT`), si están las tres. Así era hasta ahora y sigue igual.
 * 2. Si no, de la tabla `core_push_keys` (una fila, sólo la lee el rol de
 *    servicio). La primera vez que hace falta (al abrir Avisos en Ajustes o en
 *    Recordatorios) se genera el par y se guarda ahí: los recordatorios tienen
 *    que sonar sin que nadie toque la consola de Vercel.
 *
 * La pública se da siempre como el punto P-256 sin comprimir en base64url (65
 * bytes, empieza por 0x04), que es lo que piden el navegador
 * (`applicationServerKey`) y el servicio de push (`k=`). La receta de
 * `.env.example` la sacaba en SPKI (91 bytes): se acepta y se recorta, porque
 * con ella ningún navegador habría podido suscribirse.
 */

export interface VapidKeys {
  /** Punto público sin comprimir, base64url. */
  publica: string;
  /** PKCS#8 en PEM. */
  privada: string;
  /** mailto: o https: */
  contacto: string;
  origen: "entorno" | "base";
}

/** La cabecera DER de una clave pública P-256 en SPKI: lo que sobra delante del punto. */
const CABECERA_SPKI_P256 = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");

/** La pública en la forma que piden el navegador y el servicio de push, o null si no lo es. */
export function rawPublicKey(clave: string | null | undefined): string | null {
  if (!clave) return null;
  const limpia = clave.trim().replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (!/^[A-Za-z0-9_-]+$/.test(limpia)) return null;
  const bytes = Buffer.from(limpia, "base64url");
  if (bytes.length === 65 && bytes[0] === 0x04) return bytes.toString("base64url");
  if (
    bytes.length === CABECERA_SPKI_P256.length + 65 &&
    bytes.subarray(0, CABECERA_SPKI_P256.length).equals(CABECERA_SPKI_P256) &&
    bytes[CABECERA_SPKI_P256.length] === 0x04
  ) {
    return bytes.subarray(CABECERA_SPKI_P256.length).toString("base64url");
  }
  return null;
}

/** La privada pegada en Vercel a veces llega con `\n` escritos en vez de saltos. */
export function pemPrivada(texto: string): string {
  return texto.replace(/\\n/g, "\n").trim();
}

function deEntorno(): VapidKeys | null {
  const publica = rawPublicKey(process.env.VAPID_PUBLIC_KEY);
  const privada = process.env.VAPID_PRIVATE_KEY;
  const contacto = process.env.VAPID_SUBJECT;
  if (!publica || !privada || !contacto) return null;
  return { publica, privada: pemPrivada(privada), contacto, origen: "entorno" };
}

async function deLaBase(): Promise<VapidKeys | null> {
  try {
    const { data } = await createAdminClient()
      .from("core_push_keys")
      .select("public_key, private_key, subject")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return null;
    const publica = rawPublicKey(data.public_key);
    if (!publica) return null;
    return { publica, privada: data.private_key, contacto: data.subject, origen: "base" };
  } catch {
    // Sin clave de servicio (un entorno de pruebas) no hay de dónde leer.
    return null;
  }
}

/** Las claves con las que se firma, o null si no hay (entonces no se manda push). */
export async function vapidKeys(): Promise<VapidKeys | null> {
  return deEntorno() ?? (await deLaBase());
}

/** A quién avisa el servicio de push si algo va mal: la propia aplicación. */
export function contactoPara(origen: string | null | undefined): string {
  try {
    const url = new URL(origen ?? "");
    if (url.protocol === "https:" && url.hostname !== "localhost") return `https://${url.host}`;
  } catch {
    // cae al de abajo
  }
  return "mailto:avisos@example.com";
}

/** Un par nuevo: la pública ya en la forma del navegador y la privada en PEM. */
export function generarPar(): { publica: string; privada: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const der = publicKey.export({ type: "spki", format: "der" });
  return {
    publica: der.subarray(CABECERA_SPKI_P256.length).toString("base64url"),
    privada: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/**
 * Las claves, generándolas la primera vez si no están ni en el entorno ni en
 * la base. Dos peticiones a la vez no crean dos pares: la fila es única y la
 * segunda se queda con la que ganó.
 */
export async function ensureVapidKeys(origen: string | null): Promise<VapidKeys | null> {
  const ya = await vapidKeys();
  if (ya) return ya;
  try {
    const par = generarPar();
    await createAdminClient()
      .from("core_push_keys")
      .upsert(
        { id: 1, public_key: par.publica, private_key: par.privada, subject: contactoPara(origen) },
        { onConflict: "id", ignoreDuplicates: true },
      );
  } catch {
    return null;
  }
  return deLaBase();
}
