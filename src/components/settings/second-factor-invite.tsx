import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { tieneFactorVerificado } from "@/lib/auth/mfa";
import { createClient } from "@/lib/supabase/server";

/**
 * La invitación a activar el segundo factor, donde más sentido tiene: encima
 * de tus proyectos, que guardan negocios con socios.
 *
 * Sólo sale si aún no hay ningún teléfono inscrito. No obliga a nada: sin
 * factor, la cuenta sigue entrando con la contraseña.
 */
export async function SecondFactorInvite() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || tieneFactorVerificado(user)) return null;

  return (
    <Link
      href={"/settings#segundo-factor" as Route}
      className="flex items-start gap-3 rounded-[14px] border border-border bg-card p-4 text-sm transition-colors hover:border-foreground/25"
    >
      <ShieldCheck className="mt-0.5 size-5 shrink-0" style={{ color: "var(--mod-tasks)" }} aria-hidden />
      <span>
        <span className="font-medium">Protege tus proyectos con un código del teléfono.</span>{" "}
        <span className="text-muted-foreground">
          Una vez por teléfono, con una app de códigos. Si no lo activas, todo sigue igual.
        </span>
      </span>
    </Link>
  );
}
