"use server";

import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.email("Introduce un correo válido.") });

export type ForgotPasswordState = { status: "idle" | "sent"; error: string | null };

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "idle", error: parsed.error.issues[0]?.message ?? "Correo inválido." };
  }

  const supabase = await createClient();
  const redirectTo = `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    // Logged server-side only. The client always sees "sent" regardless of
    // outcome, so this endpoint can't be used to enumerate which emails
    // have an account on a private, single-tenant app.
    console.error("resetPasswordForEmail failed:", error.message);
  }

  return { status: "sent", error: null };
}
