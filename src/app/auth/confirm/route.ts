import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Donde aterrizan todos los enlaces por correo de Supabase Auth
 * (recuperación de contraseña hoy; también invitación o cambio de correo si
 * algún día se añaden).
 *
 * Acepta los dos formatos que Supabase puede enviar, porque cuál llega
 * depende de la configuración del proyecto y no del código:
 *
 *   - `code`: el flujo PKCE, que se canjea por una sesión. Es el que envía
 *     Supabase por defecto hoy.
 *   - `token_hash` + `type`: el flujo antiguo de OTP.
 *
 * Sólo se contemplaba el segundo, así que un enlace de recuperación real
 * caía en la página de error aunque llegara bien.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";
  // Sólo rutas internas: `next` viene de la URL y navegar a donde diga sin
  // comprobarlo convertiría el enlace del correo en un redirector abierto.
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(destination);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(destination);
  }

  redirect("/auth/auth-code-error");
}
