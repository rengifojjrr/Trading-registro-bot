/**
 * Lo que la portada enseña como pendiente, sea del módulo que sea.
 *
 * Vive aparte de quien lo recolecta para que cada módulo pueda aportar los
 * suyos sin que ninguno tenga que importar a los demás -- que es la regla que
 * permite que un módulo se pueda arrancar sin arrastrar los otros siete.
 */
export type PendingSeverity = "CRITICO" | "AVISO" | "INFO";

export interface PendingItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  severity: PendingSeverity;
  /** Para ordenar: cuanto más alto, más arriba. */
  weight: number;
}
