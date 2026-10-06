"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { siguienteSeguro } from "./mfa";

/**
 * Inscribir y usar el segundo factor (TOTP de Supabase Auth).
 *
 * Todo pasa por la sesión del dueño. Los códigos no se guardan en ningún
 * sitio y no se escriben en ningún registro: van de este formulario a
 * Supabase y nada más.
 */

const CODIGO = /^\d{6}$/;

export interface Inscripcion {
  error: string | null;
  factorId: string | null;
  /** El QR como imagen (SVG en `data:`), para escanearlo con la app. */
  qr: string | null;
  /** El secreto en texto, por si la cámara no puede. */
  secreto: string | null;
  /**
   * El enlace `otpauth://` que abre la app de códigos en este mismo teléfono:
   * el QR no se puede escanear con la cámara del aparato que lo enseña.
   */
  uri: string | null;
}

/** Nombre que verás en la lista: «Teléfono», «Teléfono 2»… (Supabase no deja repetirlo). */
function nombreLibre(usados: string[]): string {
  if (!usados.includes("Teléfono")) return "Teléfono";
  for (let n = 2; n < 20; n += 1) if (!usados.includes(`Teléfono ${n}`)) return `Teléfono ${n}`;
  return `Teléfono ${Date.now()}`;
}

/** Empieza a inscribir un teléfono: devuelve el QR. No vale hasta confirmar un código. */
export async function startTotpEnrollment(): Promise<Inscripcion> {
  const supabase = await createClient();
  const { data: lista, error: errorLista } = await supabase.auth.mfa.listFactors();
  if (errorLista) return { error: "No pude leer tu cuenta. Vuelve a entrar.", factorId: null, qr: null, secreto: null, uri: null };

  // Una inscripción que se quedó a medias (se cerró la pestaña antes del
  // código) estorba a la siguiente: se quita. Las verificadas no se tocan.
  for (const f of lista.all) {
    if (f.status !== "verified" && f.factor_type === "totp") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: nombreLibre(lista.all.filter((f) => f.status === "verified").map((f) => f.friendly_name ?? "")),
    issuer: "Trading Registro",
  });
  if (error || !data || data.type !== "totp") {
    return {
      error: "No se pudo empezar. Si ya tienes un teléfono inscrito, entra con su código antes de añadir otro.",
      factorId: null,
      qr: null,
      secreto: null,
      uri: null,
    };
  }
  return {
    error: null,
    factorId: data.id,
    qr: data.totp.qr_code,
    secreto: data.totp.secret,
    uri: data.totp.uri.startsWith("otpauth://") ? data.totp.uri : null,
  };
}

/**
 * «Cancelar» a medio inscribir: quita el factor sin verificar, que si no se
 * quedaba colgado en la cuenta («Teléfono 2» a medias). Uno verificado no se
 * toca desde aquí: para eso está «Quitar».
 */
export async function cancelTotpEnrollment(factorId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: lista } = await supabase.auth.mfa.listFactors();
  const factor = (lista?.all ?? []).find((f) => f.id === factorId);
  if (!factor || factor.status === "verified") return { error: null };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return { error: error ? "No se pudo cancelar del todo; se limpiará la próxima vez." : null };
}

/** Confirma el teléfono con el primer código. Desde aquí, la cuenta pide código en los teléfonos nuevos. */
export async function confirmTotpEnrollment(factorId: string, codigo: string): Promise<{ error: string | null }> {
  const limpio = codigo.replace(/\s/g, "");
  if (!CODIGO.test(limpio)) return { error: "Son seis cifras." };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: limpio });
  if (error) return { error: "Ese código no vale. Mira el que sale ahora en la app y vuelve a probar." };
  revalidatePath("/settings");
  revalidatePath("/tareas/proyectos");
  return { error: null };
}

/** Quita un teléfono. Si era el último, la cuenta deja de pedir código. */
export async function removeTotpFactor(factorId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: "No se pudo quitar. Para quitar un teléfono hay que haber entrado con código." };
  revalidatePath("/settings");
  return { error: null };
}

export type EstadoVerificar = { error: string | null };

/** El código al entrar desde un teléfono nuevo. Si vale, la sesión queda en aal2. */
export async function verifySecondFactor(_prev: EstadoVerificar, formData: FormData): Promise<EstadoVerificar> {
  const codigo = String(formData.get("code") ?? "").replace(/\s/g, "");
  const factorId = String(formData.get("factorId") ?? "");
  const next = siguienteSeguro(formData.get("next"));
  if (!CODIGO.test(codigo)) return { error: "Son seis cifras." };

  const supabase = await createClient();
  const { data: lista } = await supabase.auth.mfa.listFactors();
  const verificados = (lista?.all ?? []).filter((f) => f.status === "verified");
  const elegido = verificados.find((f) => f.id === factorId) ?? verificados[0];
  if (!elegido) redirect(next);

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: elegido.id, code: codigo });
  if (error) return { error: "Ese código no vale. Mira el que sale ahora en la app." };
  redirect(next);
}
