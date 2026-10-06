/**
 * El segundo factor: un código de seis cifras de una aplicación del teléfono
 * (TOTP, con Supabase Auth MFA).
 *
 * La regla, en dos líneas:
 *
 * - Sin factor inscrito no se pide nada: la cuenta funciona como siempre y
 *   la aplicación invita a inscribirlo. Así nadie se queda fuera por activar
 *   algo a medias.
 * - Con un factor inscrito, la sesión tiene que estar en `aal2` para ver
 *   cualquier ruta privada. Se pasa a `aal2` una vez por teléfono: Supabase
 *   conserva el nivel al refrescar la sesión, y la sesión de este proyecto no
 *   caduca, así que en ese teléfono no se vuelve a pedir.
 *
 * Todo lo de aquí es puro: el guardián de rutas (`supabase/middleware.ts`) y
 * `requireUser` lo usan, y las pruebas lo fijan.
 */

import { rutaInterna } from "./ruta-interna";

export type Aal = "aal1" | "aal2";

/** Lo que interesa de un factor de Supabase. */
export interface FactorLike {
  status: string;
  factor_type?: string;
}

/** ¿Tiene al menos un factor verificado? Uno a medio inscribir no cuenta. */
export function tieneFactorVerificado(user: { factors?: FactorLike[] | null } | null | undefined): boolean {
  return (user?.factors ?? []).some((f) => f.status === "verified");
}

/**
 * El nivel de la sesión, leído del token.
 *
 * Sólo se llama con un token que `getUser()` acaba de validar contra Supabase
 * en la misma petición: aquí no se comprueba la firma, sólo se lee el campo.
 * Un token que no se entiende cuenta como `aal1`: ante la duda, se pide el
 * código.
 */
export function aalDeToken(token: string | null | undefined): Aal | null {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return "aal1";
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const relleno = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(
      typeof atob === "function" ? atob(relleno) : Buffer.from(relleno, "base64").toString("utf8"),
    ) as { aal?: unknown };
    return json.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

/** Donde se pide el código: tiene que verse con sesión `aal1`. */
export const RUTA_DEL_CODIGO = "/verificar";

export function esRutaDelCodigo(pathname: string): boolean {
  return pathname === RUTA_DEL_CODIGO || pathname.startsWith(`${RUTA_DEL_CODIGO}/`);
}

/**
 * ¿Hay que pedir el código antes de dejar pasar?
 *
 * Sólo cuando hay un factor verificado y la sesión no está en `aal2`. Sin
 * factor, nunca: el dueño no puede quedarse fuera por no haberlo activado.
 */
export function necesitaCodigo(
  user: { factors?: FactorLike[] | null } | null | undefined,
  aal: Aal | null,
): boolean {
  return tieneFactorVerificado(user) && aal !== "aal2";
}

/**
 * Un `next` seguro para después del código: una ruta de aquí (nunca otra web,
 * ver `rutaInterna`) y nunca la propia pantalla del código.
 */
export function siguienteSeguro(next: unknown, porDefecto = "/"): string {
  const ruta = rutaInterna(next, porDefecto);
  if (esRutaDelCodigo(ruta.split(/[?#]/)[0])) return porDefecto;
  return ruta;
}
