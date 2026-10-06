import { NextResponse } from "next/server";

import { vapidKeys } from "@/lib/push/keys";

export const dynamic = "force-dynamic";

/**
 * ¿Puede este despliegue mandar avisos al teléfono? Sí o no, y de dónde salen
 * las claves («entorno» o «base»). Nada más: ni la clave, ni quién está
 * suscrito.
 *
 * Es pública a propósito (`PUBLIC_PATH_PREFIXES`): sirve para comprobar desde
 * fuera, sin entrar, que el push está listo, que es justo lo que no se podía
 * saber sin acceso a la consola de Vercel. No genera claves: eso sólo pasa con
 * sesión, al abrir Avisos.
 */
export async function GET() {
  const claves = await vapidKeys();
  return NextResponse.json(
    { configurado: claves !== null, origen: claves?.origen ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
