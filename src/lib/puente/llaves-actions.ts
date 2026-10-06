"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/require-user";

import { esCliente } from "./firma";
import { crearLlaveDe, revocarLlaveDe } from "./llaves";

/**
 * Crear y revocar las llaves del puente desde Ajustes.
 *
 * Con la sesión del dueño (y su segundo factor si lo tiene: `requireUser` lo
 * exige). La llave sale UNA vez, en la respuesta de crear; no se guarda en
 * ningún sitio de la aplicación ni vuelve a enseñarse.
 */

export async function crearLlavePuente(cliente: string): Promise<{ error: string | null; llave: string | null }> {
  const user = await requireUser();
  if (!esCliente(cliente)) return { error: "Ese cliente no existe.", llave: null };
  const r = await crearLlaveDe(user.id, cliente);
  revalidatePath("/settings");
  return r;
}

export async function revocarLlavePuente(llaveId: string): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(llaveId)) return { error: "No encontrada." };
  const r = await revocarLlaveDe(user.id, llaveId);
  revalidatePath("/settings");
  return r;
}
