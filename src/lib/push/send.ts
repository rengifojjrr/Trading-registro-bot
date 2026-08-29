import "server-only";

import { SignJWT, importPKCS8 } from "jose";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Avisos que llegan al teléfono.
 *
 * Había una tabla de notificaciones y una campana con contador, pero las dos
 * sólo se ven si abres la aplicación. Una sincronización fallida o una
 * discrepancia son justo lo que hace falta saber **sin** abrirla.
 *
 * **Se manda un aviso vacío, sin contenido.** Es la decisión que evita traer
 * una librería entera: el estándar exige cifrar el cuerpo con la clave del
 * navegador (AES128GCM sobre ECDH), y eso son varios cientos de líneas de
 * criptografía que hay que mantener. Un aviso sin cuerpo sólo necesita el JWT
 * de VAPID, que `jose` ya sabe firmar porque es lo mismo que se usa para
 * Coinbase.
 *
 * Y además es mejor: el service worker despierta, pide el aviso a la API y
 * enseña **lo que hay ahora**, no lo que había cuando se mandó. Un push con
 * cuerpo puede llegar veinte minutos tarde y decir algo que ya no es cierto.
 *
 * Sin claves VAPID configuradas no hace nada y lo dice en el registro: es una
 * mejora, no un requisito, y la aplicación tiene que funcionar igual sin ella.
 */

/** Cuánto vale el JWT de VAPID. El estándar no admite más de 24 horas. */
const VIGENCIA_SEGUNDOS = 12 * 60 * 60;

interface Suscripcion {
  endpoint: string;
  /** El origen del servicio de push, que es la audiencia del JWT. */
  p256dh: string;
  auth: string;
}

function claves() {
  const publica = process.env.VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const contacto = process.env.VAPID_SUBJECT;
  if (!publica || !privada || !contacto) return null;
  return { publica, privada, contacto };
}

/** Si el envío de avisos está configurado. Lo usa la pantalla de ajustes. */
export function pushConfigured(): boolean {
  return claves() !== null;
}

/**
 * El JWT que autoriza a este servidor ante el servicio de push.
 *
 * La audiencia es el **origen** del endpoint, no el endpoint entero: mandar la
 * URL completa hace que el servicio lo rechace, y el error que devuelve no
 * dice cuál de las dos cosas está mal.
 */
async function firmarVapid(endpoint: string, privadaPem: string, contacto: string) {
  const origen = new URL(endpoint).origin;
  const clave = await importPKCS8(privadaPem, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setAudience(origen)
    .setExpirationTime(Math.floor(Date.now() / 1000) + VIGENCIA_SEGUNDOS)
    .setSubject(contacto)
    .sign(clave);
}

/**
 * Avisa a todos los dispositivos de una persona.
 *
 * Nunca lanza: un aviso que no llega no puede tumbar la sincronización que lo
 * provocó. Los fallos se apuntan en el registro y las suscripciones muertas se
 * borran, que es lo que el estándar pide hacer con un 404 o un 410.
 */
export async function sendPushToUser(userId: string): Promise<{ sent: number }> {
  const config = claves();
  if (!config) return { sent: 0 };

  const supabase = createAdminClient();
  const { data: suscripciones } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!suscripciones || suscripciones.length === 0) return { sent: 0 };

  let enviados = 0;

  await Promise.all(
    (suscripciones as Suscripcion[]).map(async (sub) => {
      try {
        const jwt = await firmarVapid(sub.endpoint, config.privada, config.contacto);

        const res = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            Authorization: `vapid t=${jwt}, k=${config.publica}`,
            // Sin cuerpo: el service worker pedirá el contenido al despertar.
            "Content-Length": "0",
            TTL: "3600",
            Urgency: "normal",
          },
        });

        if (res.ok) {
          enviados += 1;
          return;
        }

        // 404 y 410 significan que ese navegador ya no existe. Guardarlos
        // haría que cada aviso futuro intentara un envío que no puede salir.
        if (res.status === 404 || res.status === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          return;
        }

        console.error("[push] respuesta inesperada", res.status, await res.text());
      } catch (error) {
        console.error("[push] fallo al enviar", error);
      }
    }),
  );

  return { sent: enviados };
}
