import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { parseTheme, THEME_COOKIE, THEME_LIGHT_CLASS } from "@/lib/theme";
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
 * The theme is resolved on the server from a cookie and rendered into the
 * <html> class, so the correct palette is in the very first byte of HTML --
 * no flash, no hydration mismatch, and no client JavaScript needed to
 * apply it.
 *
 * A class rather than a `data-theme` attribute, so the override lives in
 * the same cascade layer as the rest of the palette in globals.css and
 * needs no extra specificity juggling.
 *
 * Reading a cookie here makes every route dynamic. That is already true of
 * this app -- every page reads the session and the user's own rows -- so
 * there is no static prerendering being given up.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${theme === "light" ? THEME_LIGHT_CLASS : ""}`}
    >
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
