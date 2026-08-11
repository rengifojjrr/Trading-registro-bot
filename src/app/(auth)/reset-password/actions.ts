"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

export type ResetPasswordState = { error: string | null };

export async function updatePassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Contraseña inválida." };
  }

  const supabase = await createClient();

  // Requires an active recovery session, established by /auth/confirm after
  // the user clicks the emailed link. If that session is missing or
  // expired, this fails and the user is told to request a new link.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return {
      error:
        "No se pudo actualizar la contraseña. El enlace pudo haber expirado -- solicita uno nuevo.",
    };
  }

  redirect("/");
}
