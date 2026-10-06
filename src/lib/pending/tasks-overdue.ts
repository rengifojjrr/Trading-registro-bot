import type { PendingItem } from "./types";

/**
 * Lo que la portada dice de las tareas pasadas de fecha, separando lo tuyo de
 * lo que esperas de otros.
 *
 * Desde que un proyecto tiene gente, una tarea vencida puede ser de Tomás o
 * del contratista. Contarla como tuya («5 tareas pasadas de fecha» con tres de
 * otros) convierte el aviso en algo que no puedes resolver tú. Tuyas son las
 * que no tienen responsable y las de tu fila «Yo»; las subtareas no suman
 * aparte (van con su madre).
 *
 * Puro: recibe las filas ya leídas.
 */
export interface OverdueTask {
  title: string;
  due_date: string;
  assignee_id: string | null;
  parent_id: string | null;
}

function diasDesde(fecha: string, hoy: string): number {
  return Math.max(0, Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)) / 86400000));
}

function hace(dias: number): string {
  return dias === 0 ? "desde hoy" : `${dias} día${dias === 1 ? "" : "s"}`;
}

export function overdueTaskItems(
  vencidas: OverdueTask[],
  ownerId: string | null,
  hoy: string,
  nombreDe: (personId: string) => string | null,
): PendingItem[] {
  const mia = (t: OverdueTask) => t.assignee_id === null || (ownerId !== null && t.assignee_id === ownerId);
  const ordenadas = [...vencidas].filter((t) => t.parent_id === null).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const mias = ordenadas.filter(mia);
  const deOtros = ordenadas.filter((t) => !mia(t));
  const items: PendingItem[] = [];

  if (mias.length > 0) {
    const masVieja = mias[0];
    const dias = diasDesde(masVieja.due_date, hoy);
    items.push({
      id: "tasks-overdue",
      title: `${mias.length} tarea${mias.length === 1 ? "" : "s"} pasada${mias.length === 1 ? "" : "s"} de fecha`,
      // Se nombra la más vieja: un número solo se archiva mentalmente, un
      // título concreto obliga a decidir si todavía importa o si se descarta.
      detail:
        dias >= 1
          ? `La más antigua lleva ${hace(dias)}: «${masVieja.title}». Si ya no aplica, cerrarla también vale.`
          : `Entre ellas: «${masVieja.title}».`,
      href: "/tareas",
      actionLabel: "Ver tareas",
      severity: "AVISO",
      weight: 50,
    });
  }

  if (deOtros.length > 0) {
    const masVieja = deOtros[0];
    const quien = masVieja.assignee_id ? nombreDe(masVieja.assignee_id) : null;
    const dias = diasDesde(masVieja.due_date, hoy);
    items.push({
      id: "tasks-overdue-others",
      title: `Esperando a otros: ${deOtros.length} pasada${deOtros.length === 1 ? "" : "s"} de fecha`,
      detail: `${quien ? `La más vieja es de ${quien}` : "La más vieja"}: «${masVieja.title}»${dias >= 1 ? `, lleva ${hace(dias)}` : ""}.`,
      href: "/tareas/todas?de=OTROS",
      actionLabel: "Ver de quién",
      severity: "INFO",
      weight: 30,
    });
  }

  return items;
}
