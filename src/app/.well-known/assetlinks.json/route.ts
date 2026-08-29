import { NextResponse } from "next/server";

/**
 * El enlace de activos digitales: lo que hace que el APK abra sin barra de
 * direcciones.
 *
 * Android sólo se fía de una aplicación que dice representar a un dominio si
 * el propio dominio lo confirma, y esto es esa confirmación. Sin ella el APK
 * funciona igual, pero se abre con la barra del navegador arriba -- que es
 * exactamente el aspecto que hace que no parezca una aplicación.
 *
 * Se sirve desde una ruta y no como archivo estático a propósito: la huella
 * del certificado sale de una variable de entorno, así que generar o rotar la
 * clave de firma es cambiar una variable en Vercel, no un despliegue de
 * código. Es la misma idea que con el resto de secretos de este proyecto --
 * la clave de firma nunca entra al repositorio.
 *
 * Cuando la variable no está puesta devuelve una lista vacía, que es lo
 * correcto: una lista vacía significa «este dominio no avala a nadie», y es lo
 * que hay que decir mientras no haya un APK firmado.
 */
export const dynamic = "force-dynamic";

/** El identificador del paquete Android. Tiene que coincidir con el del APK. */
const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME ?? "app.registro.trading";

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    // Una huella SHA-256 son 32 bytes en hexadecimal separados por dos puntos.
    // Filtrar por la forma evita que un espacio de más en la variable de
    // entorno produzca un archivo que Android rechaza entero sin decir por qué.
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));

  const body =
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: PACKAGE_NAME,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ];

  return NextResponse.json(body, {
    headers: {
      // Android lo pide de vez en cuando y no le sienta mal una caché corta,
      // pero no tan larga como para que rotar la clave tarde un día en surtir
      // efecto.
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json",
    },
  });
}
