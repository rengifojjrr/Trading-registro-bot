/**
 * Qué cuenta como «pasó este día».
 *
 * Puro y aparte de las consultas para poder probarlo: son las reglas que
 * deciden qué sale en la ficha de un día y qué punto se pinta en el
 * calendario, y equivocarse aquí no da ningún error -- sólo enseña el día
 * equivocado, que es mucho peor.
 */

export interface DatedTask {
  due_date: string | null;
  /** El último día, cuando la tarea dura más de uno. */
  due_end: string | null;
  /** Marca de tiempo completa, o null si sigue abierta. */
  completed_at: string | null;
}

export interface DatedPiece {
  planned_date: string | null;
  published_at: string | null;
}

export interface DayTouch {
  /** Estaba prevista o vencía ese día. */
  due: boolean;
  /** Se cerró o se publicó ese día. */
  done: boolean;
}

/**
 * Si una tarea toca un día.
 *
 * Una tarea con rango toca todos sus días y no sólo el último: aplanarla a la
 * fecha de fin es lo que hacía que el calendario mintiera sobre cuándo hay
 * trabajo. Y una cerrada toca además el día en que se cerró, aunque venciera
 * otro -- que es justo lo que se quiere ver al repasar la semana.
 */
export function taskTouches(task: DatedTask, date: string): DayTouch {
  const due =
    task.due_date !== null && date >= task.due_date && date <= (task.due_end ?? task.due_date);

  const done = task.completed_at !== null && task.completed_at.slice(0, 10) === date;

  return { due, done };
}

/** Si una pieza de contenido toca un día: prevista, publicada, o las dos. */
export function pieceTouches(piece: DatedPiece, date: string): DayTouch {
  return {
    due: piece.planned_date === date,
    done: piece.published_at !== null && piece.published_at.slice(0, 10) === date,
  };
}

/**
 * Los días que ocupa una tarea, acotados a una ventana.
 *
 * El tope no es una optimización: un dedazo en el año -- 2126 en vez de 2026
 * -- daría treinta y seis mil días y colgaría el bucle que pinta el mes.
 */
export function taskDays(task: DatedTask, until: string): string[] {
  if (!task.due_date) return [];

  const end = task.due_end ?? task.due_date;
  const days: string[] = [];

  for (let day = task.due_date; day <= end; day = nextDay(day)) {
    days.push(day);
    if (day > until) break;
  }

  return days;
}

export function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
