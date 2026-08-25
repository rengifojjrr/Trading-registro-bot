import "server-only";

import { todayIn } from "@/core/today";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import type { PendingItem } from "./types";

/**
 * Lo que está esperando en los módulos de vida.
 *
 * Ninguno avisaba de nada: contra la base de datos real hay doce tareas
 * vencidas y no existe una sola línea de código que lo diga. Un módulo que
 * guarda y no avisa es una lista que hay que acordarse de mirar, y acordarse
 * es exactamente lo que la aplicación tenía que quitar de en medio.
 *
 * Tres reglas para que esto no se convierta en ruido:
 *
 * 1. **Solo lo que ya pasó de fecha.** Nada de «tienes cosas pendientes»: eso
 *    lo sabe cualquiera. Vencidas, que es lo que exige decidir algo.
 * 2. **Nada de rachas ni culpa.** «Llevas 3 días sin apuntar el sueño» no es
 *    accionable a las nueve de la mañana y sí es un reproche.
 * 3. **Uno por módulo, agrupado.** Doce avisos de doce tareas son doce
 *    ocasiones de aprender a ignorarlos.
 */
export async function gatherLifePending(): Promise<PendingItem[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();

  // El día del usuario, no el del servidor: a las 23:30 en Bogotá el servidor
  // ya cree que es mañana, y marcaría como vencida una tarea de hoy.
  const hoy = todayIn(settings?.timezone || "UTC");

  const items: PendingItem[] = [];

  const { data: vencidas } = await supabase
    .from("tasks_items")
    .select("id, title, due_date")
    .eq("user_id", user.id)
    .neq("status", "HECHA")
    .not("due_date", "is", null)
    .lt("due_date", hoy)
    .order("due_date")
    .limit(50);

  if (vencidas && vencidas.length > 0) {
    const masVieja = vencidas[0];
    const dias = Math.max(
      0,
      Math.round(
        (Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${masVieja.due_date}T00:00:00Z`)) / 86400000,
      ),
    );

    items.push({
      id: "tasks-overdue",
      title: `${vencidas.length} tarea${vencidas.length === 1 ? "" : "s"} pasada${vencidas.length === 1 ? "" : "s"} de fecha`,
      // Se nombra la más vieja: un número solo se archiva mentalmente, un
      // título concreto obliga a decidir si todavía importa o si se descarta.
      detail:
        dias >= 1
          ? `La más antigua lleva ${dias} día${dias === 1 ? "" : "s"}: «${masVieja.title}». Si ya no aplica, cerrarla también vale.`
          : `Entre ellas: «${masVieja.title}».`,
      href: "/tareas",
      actionLabel: "Ver tareas",
      severity: "AVISO",
      weight: 50,
    });
  }

  return items;
}
