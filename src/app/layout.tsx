import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { appearanceAttributes } from "@/lib/appearance/catalog";
import { appearanceStylesheet } from "@/lib/appearance/css";
import { readAppearance } from "@/lib/appearance/storage";
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
      </body>
    </html>
  );
}
