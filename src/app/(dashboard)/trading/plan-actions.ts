"use server";

import { revalidatePath } from "next/cache";

import { cerrarPlan, crearPlan, descartarPlan } from "@/lib/journal/plan-store";

/**
 * Empezar, cerrar y descartar un plan.
 *
 * Éstas **sí** son Server Actions, al contrario que guardar cada respuesta: las
 * tres ocurren con el cuadro ya fuera de pantalla --o justo antes de abrirlo--,
 * así que el refresco que dispara toda Server Action no puede desmontar nada, y
 * además es lo que se quiere: que el panel se entere de que hay un plan nuevo
 * esperando, o de que ya no lo hay.
 *
 * Guardar una respuesta va por `/api/planes/[planId]` justamente porque ese
 * refresco, a media encuesta, la cerraría sola.
 */

export async function empezarPlan(productId: string | null): Promise<{ id: string | null; error: string | null }> {
  // Sin `revalidatePath`: el plan nace vacío y no sale en el panel hasta que
  // tenga algo dentro, así que refrescar aquí sería pedirle al servidor que
  // vuelva a pintar exactamente lo mismo.
  return crearPlan(productId);
}

export async function terminarPlan(planId: string): Promise<{ error: string | null }> {
  const { error } = await cerrarPlan(planId);
  revalidatePath("/trading");
  return { error };
}

export async function tirarPlan(planId: string): Promise<{ error: string | null }> {
  const { error } = await descartarPlan(planId);
  revalidatePath("/trading");
  return { error };
}
