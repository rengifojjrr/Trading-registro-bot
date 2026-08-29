/**
 * El evento que abre la búsqueda desde cualquier sitio.
 *
 * La búsqueda escucha ⌘K por su cuenta, pero en el móvil no hay ⌘K y la barra
 * de abajo tiene que poder abrirla. Un evento del navegador y no un estado
 * compartido porque el layout que las contiene a las dos es un componente de
 * servidor: no puede tener estado ni pasar un manejador.
 */
export const SEARCH_EVENT = "vida:abrir-busqueda";
