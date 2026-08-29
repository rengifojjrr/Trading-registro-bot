import type { MetadataRoute } from "next";

/**
 * El manifiesto que hace que esto se pueda instalar como aplicación.
 *
 * Es también el contrato con el APK: la herramienta que envuelve el sitio
 * (Bubblewrap, ver `docs/ANDROID.md`) lee de aquí el nombre, los colores y los
 * iconos, así que cambiar el nombre en este archivo cambia el de la aplicación
 * instalada -- pero sólo al reconstruir el APK, no al desplegar.
 *
 * Lo que **sí** cambia sin reconstruir nada es el contenido: el APK abre la
 * URL de producción, así que cada despliegue se ve en el móvil sin tocar el
 * teléfono. Es la razón de hacerlo así y no con una aplicación nativa.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trading Registro Bot",
    // Doce caracteres o menos: es lo que cabe debajo del icono en el lanzador
    // de Android antes de que lo corte con puntos suspensivos.
    short_name: "Registro",
    description:
      "Diario privado de trading de futuros de Bitcoin, con sueño, hábitos, tareas, comidas, lecturas y contenido.",
    // `id` fijo y explícito: es lo que identifica la aplicación entre
    // instalaciones. Si se dejara implícito lo derivaría de `start_url`, y
    // cambiar la pantalla de inicio contaría como otra aplicación distinta.
    id: "/",
    start_url: "/",
    // El alcance decide qué se abre dentro de la aplicación y qué se va al
    // navegador. Con la raíz, todo el sitio es la aplicación; un enlace a
    // Coinbase o a Notion sale fuera, que es lo que se quiere.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // El mismo azul oscuro del icono y del tema: la barra de estado de Android
    // lo usa, y un color distinto al del fondo deja una franja que se nota.
    background_color: "#0b1220",
    theme_color: "#0b1220",
    lang: "es",
    dir: "ltr",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Maskable aparte: Android recorta el icono a la forma del lanzador, y
      // sin una versión con margen la marca sale con las esquinas cortadas.
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Los cuatro accesos que salen al mantener pulsado el icono. Son las cuatro
    // cosas que se hacen a diario; el resto se navega desde dentro.
    shortcuts: [
      {
        name: "Apuntar operaciones",
        short_name: "Diario",
        url: "/journal",
        description: "Lo que cerraste y todavía no has apuntado.",
      },
      { name: "Operaciones", short_name: "Trades", url: "/trades" },
      { name: "Panel de trading", short_name: "Panel", url: "/trading" },
      { name: "Registrar el día", short_name: "Hoy", url: "/" },
    ],
  };
}
