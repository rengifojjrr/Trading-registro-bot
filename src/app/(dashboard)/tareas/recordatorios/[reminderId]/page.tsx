import type { Route } from "next";
import { redirect } from "next/navigation";

/**
 * Un recordatorio no tiene ficha propia: vive en su lista. Esta ruta existe
 * para los enlaces que apuntan a uno (la papelera, un aviso) y lleva a la
 * lista con él resaltado.
 */
export default async function ReminderRedirect({ params }: { params: Promise<{ reminderId: string }> }) {
  const { reminderId } = await params;
  redirect(`/tareas/recordatorios?r=${encodeURIComponent(reminderId)}` as Route);
}
