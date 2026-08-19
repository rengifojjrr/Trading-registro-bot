import "server-only";

import { headers } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * La URL pública de la aplicación, deducida de la petición que se está
 * atendiendo.
 *
 * Existe por un fallo real: los enlaces de recuperación de contraseña se
 * construían con NEXT_PUBLIC_APP_URL, que cae por defecto a
 * http://localhost:3000. Con esa variable sin poner en el despliegue, el
 * correo llevaba a la máquina del usuario -- donde resultó haber otro
 * proyecto escuchando en ese puerto, así que el enlace acababa en un
 * servicio distinto.
 *
 * Deducirla de las cabeceras elimina la clase entera de error: sea cual sea
 * el dominio desde el que se pidió el correo, ahí es donde vuelve. La
 * variable de entorno queda sólo como último recurso.
 */
export async function appOrigin(): Promise<string> {
  const list = await headers();

  // Vercel y cualquier proxy inverso ponen el host real aquí; `host` a secas
  // es el del contenedor interno.
  const host = list.get("x-forwarded-host") ?? list.get("host");
  if (!host) return publicEnv().NEXT_PUBLIC_APP_URL;

  const protocol = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
