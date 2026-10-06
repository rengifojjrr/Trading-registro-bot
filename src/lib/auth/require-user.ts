import "server-only";

import { redirect } from "next/navigation";

import { RUTA_DEL_CODIGO, aalDeToken, necesitaCodigo, tieneFactorVerificado } from "@/lib/auth/mfa";
import { createClient } from "@/lib/supabase/server";

/**
 * For use at the top of Server Components / Server Actions under
 * (dashboard). src/proxy.ts already redirects unauthenticated requests
 * before render, so hitting the redirect() here should be rare -- this is
 * defense in depth, and gives callers a typed, non-null user.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // El segundo factor, también aquí: una acción de servidor que llegara sin
  // pasar por el guardián no puede leer ni escribir nada con una sesión aal1
  // de una cuenta que ya tiene factor.
  if (tieneFactorVerificado(user)) {
    const { data } = await supabase.auth.getSession();
    if (necesitaCodigo(user, aalDeToken(data.session?.access_token))) {
      redirect(RUTA_DEL_CODIGO);
    }
  }

  return user;
}
