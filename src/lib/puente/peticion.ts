import "server-only";

import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  firmar,
  firmaCoincide,
  horaValida,
  leerCabeceras,
  textoAFirmar,
  VENTANA_S,
  type ClientePuente,
} from "./firma";
import { llavesVivas } from "./llaves";

/**
 * La puerta de cada ruta del puente: límite por dirección, firma, hora, nonce
 * y límite por cliente (éste, sólo con la firma buena).
 *
 * Las rutas están en `PUBLIC_PATH_PREFIXES` (si no, el guardián de sesión les
 * contestaba con un 307 a /login, como a los crons). Por eso cada `route.ts`
 * de `/api/puente` empieza por `abrirPeticion` (lo vigila `rutas.test.ts`).
 *
 * Nada de lo que llega ni de lo que sale se escribe en `console.*`: los
 * registros de Vercel no son sitio para títulos de tareas, y el repo es
 * público.
 */

/**
 * Por cliente: un bot que se vuelve loco no tumba la aplicación. Sólo cuenta
 * lo que viene firmado: el repo es público y el nombre del cliente («mac-1»)
 * no es secreto, así que si contara antes de la firma cualquiera dejaría al
 * bot con 429 mandando 120 peticiones sin firmar con su nombre.
 */
export const LIMITE_POR_MINUTO = 120;

/**
 * Por dirección, antes de mirar la firma (que lee las llaves en la base): lo
 * que llega sin firmar se frena aquí. El doble que por cliente, para que el
 * bot nunca lo toque antes que su propio límite.
 */
export const LIMITE_POR_IP_MINUTO = 2 * LIMITE_POR_MINUTO;

/** Lo más grande que acepta una ruta (un archivo de proyecto cabe de sobra). */
export const CUERPO_MAX_BYTES = 400_000;

export interface PeticionAbierta {
  userId: string;
  cliente: ClientePuente;
  llaveId: string;
  /** El cuerpo tal cual llegó (ya contado en la firma). */
  cuerpo: string;
}

type Motivo = "cabeceras" | "hora" | "firma" | "repetida" | "limite" | "grande";

function rechazo(motivo: Motivo, extra: Record<string, unknown> = {}, status = 401): NextResponse {
  return NextResponse.json(
    { error: "no_autorizado", motivo, ...extra },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function despacio(reintentarEn: number): NextResponse {
  return NextResponse.json(
    { error: "despacio", motivo: "limite", reintentar_en: reintentarEn },
    { status: 429, headers: { "retry-after": String(reintentarEn), "cache-control": "no-store" } },
  );
}

/**
 * De dónde viene: la primera de `x-forwarded-for` (en Vercel la pone su borde,
 * no el que llama), o `x-real-ip`. Sin ninguna, todas comparten un cupo.
 */
function direccionDe(headers: Headers): string {
  const primera = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (primera || headers.get("x-real-ip")?.trim() || "sin-ip").slice(0, 64);
}

/**
 * Comprueba la petición. Devuelve lo que la ruta necesita o la respuesta de
 * rechazo, ya hecha. El cuerpo se lee aquí (una sola vez) porque entra en la
 * firma.
 */
export async function abrirPeticion(
  request: Request,
  { ahoraMs = Date.now() }: { ahoraMs?: number } = {},
): Promise<PeticionAbierta | NextResponse> {
  const cab = leerCabeceras(request.headers);
  if (!cab) return rechazo("cabeceras");

  const porIp = checkRateLimit(`puente:ip:${direccionDe(request.headers)}`, {
    capacity: LIMITE_POR_IP_MINUTO,
    windowSeconds: 60,
  });
  if (!porIp.allowed) return despacio(porIp.retryAfter);

  const ahoraS = Math.floor(ahoraMs / 1000);
  // La hora del servidor va en la respuesta: el bot la usa para saber cuánto
  // se desvía su reloj y avisarlo en Salud.
  if (!horaValida(cab.ts, ahoraS, VENTANA_S)) return rechazo("hora", { ahora: ahoraS });

  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > CUERPO_MAX_BYTES) return rechazo("grande", {}, 413);
  const cuerpo = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  if (Buffer.byteLength(cuerpo, "utf8") > CUERPO_MAX_BYTES) return rechazo("grande", {}, 413);

  const url = new URL(request.url);
  const texto = textoAFirmar(request.method, `${url.pathname}${url.search}`, cab.ts, cab.nonce, cuerpo);

  let elegida: { id: string; userId: string } | null = null;
  for (const llave of await llavesVivas(cab.cliente)) {
    // Se prueban todas, aunque la primera acierte: el tiempo no dice cuál.
    if (firmaCoincide(cab.firma, firmar(llave.llave, texto)) && !elegida) {
      elegida = { id: llave.id, userId: llave.userId };
    }
  }
  if (!elegida) return rechazo("firma");

  const porCliente = checkRateLimit(`puente:${cab.cliente}`, { capacity: LIMITE_POR_MINUTO, windowSeconds: 60 });
  if (!porCliente.allowed) return despacio(porCliente.retryAfter);

  const admin = createAdminClient();
  const { data: nueva, error } = await admin.rpc("puente_usar_nonce", { p_llave: elegida.id, p_nonce: cab.nonce });
  if (error || nueva !== true) return rechazo("repetida");

  const ahora = new Date(ahoraMs).toISOString();
  // El latido de cualquier llamada, y cuándo se usó la llave. No se espera a
  // que acaben para contestar más tarde: si fallan, la petición sigue.
  await Promise.all([
    admin
      .from("puente_clientes")
      .upsert({ user_id: elegida.userId, cliente: cab.cliente, visto_en: ahora }, { onConflict: "user_id,cliente" }),
    admin.from("puente_llaves").update({ usada_en: ahora }).eq("id", elegida.id),
  ]);

  return { userId: elegida.userId, cliente: cab.cliente, llaveId: elegida.id, cuerpo };
}

export function esRechazo(valor: PeticionAbierta | NextResponse): valor is NextResponse {
  return valor instanceof NextResponse;
}

/** Una respuesta del puente: JSON y nunca en caché. */
export function respuesta(cuerpo: unknown, status = 200): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
}
