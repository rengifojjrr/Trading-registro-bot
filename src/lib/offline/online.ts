/**
 * ¿Se sabe seguro que no hay red?
 *
 * Sólo en el navegador y sólo con `navigator.onLine === false`. En el servidor
 * (Node 21 o más nuevo) también existe `navigator`, pero sin `onLine`: leerlo
 * como `!navigator.onLine` daba «sin conexión» en todo el HTML del servidor, y
 * el aviso parpadeaba al cargar cada pantalla (y React se quejaba de que el
 * servidor y el navegador no pintaban lo mismo).
 */
export function sinRed(
  entorno: { window?: unknown; navigator?: { onLine?: boolean } } = {
    window: typeof window === "undefined" ? undefined : window,
    navigator: typeof navigator === "undefined" ? undefined : navigator,
  },
): boolean {
  return entorno.window !== undefined && entorno.navigator?.onLine === false;
}
