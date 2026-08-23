/**
 * Los treinta días que la papelera prometía y nadie cumplía.
 *
 * La página decía «se guardará 30 días» desde el primer día y no había nada
 * que borrara nunca: la papelera crecía para siempre. Es de los dos fallos
 * peores que puede tener una promesa así, y no el que parece.
 *
 * El obvio es que ocupa sitio. El de verdad es que «borrar» deja de significar
 * borrar: quien vacía una entrada del diario porque no quiere que siga por ahí
 * la está dejando entera, con sus comentarios, indefinidamente. Y al revés --
 * si mañana se empieza a purgar sin avisar, alguien pierde algo que creía
 * recuperable. Por eso la cuenta atrás se enseña por fila, no solo se ejecuta.
 *
 * Puro: recibe las filas ya leídas y no sabe de base de datos.
 */

export const RETENTION_DAYS = 30;

/** Se avisa a partir de aquí, con margen para rescatar algo antes de perderlo. */
export const WARN_WITHIN_DAYS = 5;

export interface TrashAge {
  id: string;
  deletedAt: string;
}

export interface RetentionStatus {
  id: string;
  /** Días que quedan; 0 significa que se borra en la próxima pasada. */
  daysLeft: number;
  expiring: boolean;
  label: string;
}

export function describeRetention(row: TrashAge, now: Date = new Date()): RetentionStatus {
  const borrado = new Date(row.deletedAt).getTime();

  if (Number.isNaN(borrado)) {
    // Una fecha ilegible no se purga: se deja y se dice que no se sabe. Borrar
    // por no saber leer una fecha es la peor forma de perder algo.
    return { id: row.id, daysLeft: RETENTION_DAYS, expiring: false, label: "Sin fecha de borrado" };
  }

  const transcurridos = (now.getTime() - borrado) / (24 * 60 * 60 * 1000);
  const daysLeft = Math.max(0, Math.ceil(RETENTION_DAYS - transcurridos));

  return {
    id: row.id,
    daysLeft,
    expiring: daysLeft <= WARN_WITHIN_DAYS,
    label:
      daysLeft === 0
        ? "Se borra hoy"
        : daysLeft === 1
          ? "Queda 1 día"
          : `Quedan ${daysLeft} días`,
  };
}

/** Qué filas ya pasaron de los treinta días. */
export function findExpired(rows: TrashAge[], now: Date = new Date()): string[] {
  const corte = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  return rows
    .filter((r) => {
      const borrado = new Date(r.deletedAt).getTime();
      if (Number.isNaN(borrado)) return false;
      return borrado < corte;
    })
    .map((r) => r.id);
}
