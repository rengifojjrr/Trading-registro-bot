import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { appearanceAttributes } from "@/lib/appearance/catalog";
import { appearanceStylesheet } from "@/lib/appearance/css";
import { readAppearance } from "@/lib/appearance/storage";
import { ServiceWorkerRegistration } from "@/components/layout/service-worker";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trading Registro Bot",
  description: "Diario privado de trading de futuros de Bitcoin.",
  // Sin esto, iOS abre la aplicación instalada dentro de Safari con su barra
  // de direcciones. En Android lo decide el manifiesto; en iOS, estas dos
  // líneas. La aplicación se usa desde el móvil, así que importan las dos.
  appleWebApp: {
    capable: true,
    title: "Registro",
    statusBarStyle: "black-translucent",
  },
  // Que el APK y la web compartan una sola dirección canónica: es lo que
  // evita acabar con dos direcciones que enseñan lo mismo y una que se queda
  // vieja. Se toma de la variable de entorno para no tenerla escrita a mano.
  metadataBase: process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL)
    : undefined,
};

/**
 * El color de la barra de estado de Android cuando la aplicación está
 * instalada.
 *
 * Va en `viewport` y no en `metadata` porque Next lo pide así desde la 14; en
 * `metadata` se ignora en silencio, que es cómo se acaba con una franja blanca
 * encima de una aplicación oscura sin saber por qué.
 */
export const viewport: Viewport = {
  themeColor: "#0b1220",
  // La aplicación tiene tablas y gráficos: sin esto, un doble toque hace zoom
  // y descoloca la vista justo cuando se está intentando leer una cifra.
  // No se bloquea el zoom por accesibilidad -- se permite hasta 5x.
  maximumScale: 5,
  viewportFit: "cover",
};

/**
 * Las cinco paletas, escritas una sola vez por proceso.
 *
 * Se emiten todas y no sólo la elegida: así cambiar de paleta es cambiar una
 * letra de un atributo, sin recargar y sin pedirle nada al servidor. Es lo
 * que permite que el panel no tenga botón de «Guardar».
 */
const PALETTE_CSS = appearanceStylesheet();

/**
 * La apariencia se resuelve en el servidor y sale en el primer byte de HTML.
 *
 * Es la razón de guardarla en cookies y no en `localStorage`: el servidor no
 * puede leer `localStorage`, así que con él habría que mandar la página con
 * el aspecto de fábrica y corregirla después con un script -- que es
 * exactamente el parpadeo que hay que evitar. Con la cookie, los cinco ejes
 * ya vienen puestos y nunca se ve un aspecto que nadie eligió.
 *
 * Leer una cookie aquí hace dinámicas todas las rutas. Ya lo eran: cada
 * página lee la sesión y las filas de su usuario, así que no se está
 * renunciando a ningún prerenderizado.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const store = await cookies();
  const appearance = readAppearance((name) => store.get(name)?.value);

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
      {...appearanceAttributes(appearance)}
    >
      <head>
        {/*
         * `dangerouslySetInnerHTML` porque una hoja de estilo tiene que
         * llegar al navegador tal cual: React escaparía `&` y `<` en un nodo
         * de texto, y dentro de `<style>` los navegadores no deshacen las
         * entidades, así que se rompería el CSS. No hay nada peligroso que
         * inyectar -- este texto sale de un catálogo cerrado de cinco
         * paletas escritas a mano, sin una sola cadena que venga de fuera.
         */}
        <style dangerouslySetInnerHTML={{ __html: PALETTE_CSS }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
