import { redirect } from "next/navigation";

import { aalDeToken, siguienteSeguro, tieneFactorVerificado } from "@/lib/auth/mfa";
import { createClient } from "@/lib/supabase/server";

import { VerifyForm } from "./verify-form";

/**
 * El código del segundo factor, al entrar desde un teléfono nuevo.
 *
 * Sólo tiene sentido con sesión y con un factor inscrito. Sin sesión se va a
 * entrar; sin factor, o ya verificado, se sigue adonde ibas.
 */
export default async function VerifyPage(props: PageProps<"/verificar">) {
  const searchParams = await props.searchParams;
  const next = siguienteSeguro(searchParams.next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!tieneFactorVerificado(user)) redirect(next);

  const { data } = await supabase.auth.getSession();
  if (aalDeToken(data.session?.access_token) === "aal2") redirect(next);

  const factores = (user.factors ?? [])
    .filter((f) => f.status === "verified")
    .map((f) => ({ id: f.id, nombre: f.friendly_name ?? "Teléfono" }));

  return <VerifyForm next={next} factores={factores} />;
}
