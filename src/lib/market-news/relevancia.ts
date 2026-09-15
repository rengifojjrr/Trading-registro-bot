/**
 * Cuánto importó un titular, medido y no opinado.
 *
 * Es la decisión de fondo de todo este módulo. Lo natural habría sido
 * clasificar la importancia por las palabras del título -- «Senado», «hackeo»,
 * «ETF» -- y habría estado mal en los dos sentidos: hay titulares con forma de
 * catástrofe que el mercado se traga sin pestañear, y frases anodinas detrás
 * de una caída del 3 %. Adivinar cuáles importan es justamente el trabajo que
 * una aplicación con velas de un minuto y la hora exacta de publicación **no
 * tiene que hacer**: puede mirar.
 *
 * Así que lo que se marca no es «esta noticia es importante» sino «después de
 * esta noticia el precio se movió tanto». Es un hecho, y además es honesto
 * sobre lo que no dice: que el precio se moviera después no demuestra que se
 * moviera *por* ello. La pantalla lo escribe con esas palabras.
 *
 * Puro.
 */

/**
 * A partir de aquí se marca, en porcentaje absoluto sobre el precio previo.
 *
 * Medio punto en una hora sobre Bitcoin no es ruido de fondo pero tampoco es
 * un acontecimiento; un punto y medio sí es algo que se nota en una posición
 * apalancada. Dos escalones y no uno porque «movió» y «movió mucho» son
 * distintos y meterlos en el mismo cajón desperdicia la medición.
 */
export const UMBRAL_MOVIO = 0.5;
export const UMBRAL_MOVIO_MUCHO = 1.5;

export type GradoDeMovimiento = "SIN_MEDIR" | "QUIETO" | "MOVIO" | "MOVIO_MUCHO";

export function gradoDeMovimiento(maxMovePct: number | null): GradoDeMovimiento {
  if (maxMovePct === null) return "SIN_MEDIR";
  const magnitud = Math.abs(maxMovePct);
  if (magnitud >= UMBRAL_MOVIO_MUCHO) return "MOVIO_MUCHO";
  if (magnitud >= UMBRAL_MOVIO) return "MOVIO";
  return "QUIETO";
}

/**
 * Cómo se dice cada grado.
 *
 * «Sin medir» y «quieto» no son lo mismo y por eso tienen textos distintos:
 * uno es «todavía no lo sabemos» y el otro «lo miramos y no pasó nada», y
 * confundirlos es prometer una certeza que no hay.
 */
export const GRADO_LABELS: Record<GradoDeMovimiento, string | null> = {
  SIN_MEDIR: null,
  QUIETO: null,
  MOVIO: "movió",
  MOVIO_MUCHO: "movió mucho",
};

export function estaMarcado(grado: GradoDeMovimiento): boolean {
  return grado === "MOVIO" || grado === "MOVIO_MUCHO";
}
