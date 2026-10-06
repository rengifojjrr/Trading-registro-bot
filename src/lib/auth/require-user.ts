import "server-only";

import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { RUTA_DEL_CODIGO, aalDeToken, necesitaCodigo, tieneFactorVerificado } from "@/lib/auth/mfa";
import { createClient } from "@/lib/supabase/server";

type Comprobacion = { user: null; falta: "sesion" } | { user: User; falta: "codigo" | null };

/** Quién llama y si le falta el código del segundo factor. */
async function comprobar(): Promise<Comprobacion> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, falta: "sesion" };

  // El segundo factor, también aquí: una acción de servidor que llegara sin
  // pasar por el guardián no puede leer ni escribir nada con una sesión aal1
  // de una cuenta que ya tiene factor.
  if (tieneFactorVerificado(user)) {
    const { data } = await supabase.auth.getSession();
    if (necesitaCodigo(user, aalDeToken(data.session?.access_token))) {
      return { user, falta: "codigo" };
    }
  }

  return { user, falta: null };
}

/**
 * For use at the top of Server Components / Server Actions under
 * (dashboard). src/proxy.ts already redirects unauthenticated requests
 * before render, so hitting the redirect() here should be rare -- this is
 * defense in depth, and gives callers a typed, non-null user.
 */
export async function requireUser() {
  const { user, falta } = await comprobar();
  if (!user) redirect("/login");
  if (falta === "codigo") redirect(RUTA_DEL_CODIGO);
  return user;
}

/**
 * Lo mismo para una ruta que contesta JSON a un `fetch`: en vez de redirigir
 * (que le llegaría como una página HTML donde esperaba datos) devuelve `null`,
 * y la ruta contesta 401. Con una cuenta que tiene factor y una sesión aal1
 * también es `null`: ninguna ruta se salta el código.
 */
export async function userForApi(): Promise<User | null> {
  const { user, falta } = await comprobar();
  return user && falta === null ? user : null;
}
