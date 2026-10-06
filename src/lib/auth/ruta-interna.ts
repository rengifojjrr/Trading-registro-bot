/**
 * Una dirección de vuelta (`next`) que sólo puede ser una ruta de aquí.
 *
 * `next` llega en la URL, así que cualquiera puede mandar un enlace con el que
 * quiera. Mirar sólo que empiece por «/» no basta: el navegador quita
 * tabuladores y saltos de línea de una URL y cambia «\» por «/», con lo que
 * «/\t/otra.web» o «/\\otra.web» acaban siendo «//otra.web», que es otra web.
 * Por eso se rechaza cualquier carácter de control, espacio o «\», y además se
 * resuelve contra un origen inventado, se exige que siga siendo ese origen y
 * que la ruta ya normalizada no empiece por «//».
 *
 * Devuelve la ruta limpia (camino, búsqueda y ancla) o `porDefecto`.
 */
const ORIGEN = "https://ruta.invalid";

export function rutaInterna(next: unknown, porDefecto = "/"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return porDefecto;
  if (!next.startsWith("/")) return porDefecto;
  if (/[\u0000- \u007f-\u009f\\]/.test(next)) return porDefecto;
  let url: URL;
  try {
    url = new URL(next, ORIGEN);
  } catch {
    return porDefecto;
  }
  if (url.origin !== ORIGEN) return porDefecto;
  // «/..//otra.web» se normaliza a «//otra.web»: lo que se devuelve también se
  // mira, porque es lo que el navegador va a leer.
  const ruta = `${url.pathname}${url.search}${url.hash}`;
  if (ruta.startsWith("//")) return porDefecto;
  return ruta;
}
