import { BottomNav } from "@/components/layout/bottom-nav";
import { DemoDataBanner } from "@/components/layout/demo-data-banner";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { MobileGestures } from "@/components/layout/mobile-gestures";
import { OfflineQueue } from "@/components/layout/offline-queue";
import { Sidebar } from "@/components/layout/sidebar";
import { SyncOnVisit } from "@/components/layout/sync-on-visit";
import { Topbar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // The document itself scrolls (not a clipped single-viewport shell with
  // an inner overflow-y-auto main) -- sidebar/topbar/banner stay in place
  // via position: sticky instead. A fixed h-svh + overflow-hidden shell
  // measures fine for normal use, but any tool that captures beyond one
  // viewport (Playwright's fullPage screenshot, phones' scrolling-screenshot
  // feature) resizes against document.documentElement, which svh then
  // recomputes against -- producing a huge blank void below real content
  // instead of the rest of the page. Natural scroll has no such mismatch.
  //
  // No overflow-x-hidden here even defensively -- any non-visible overflow-x
  // makes overflow-y compute to auto too (CSS overflow spec), which turns
  // this div into its own scroll container and breaks position: sticky
  // below, since sticky then pins against this (never-scrolling) div
  // instead of the actual scrolling document.
  return (
    <div className="flex min-h-svh bg-background">
      <div className="sticky top-0 z-20 hidden h-svh md:block">
        <KeyboardShortcuts />
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Abrir la aplicación es la señal más fiable de que quieres ver
            datos ciertos, así que es cuando se piden. */}
        <SyncOnVisit />
        <Topbar userEmail={user.email ?? ""} />
        <DemoDataBanner />
        {/* Lo que se apuntó sin cobertura, y el aviso de que no la hay. Va
            aquí arriba porque es un estado de toda la aplicación, no de una
            pantalla. */}
        <OfflineQueue />
        <MobileGestures />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          {/* `gap-aire` y no `gap-6`: éste es el hueco entre bloques que
              mueve la densidad. Es el único sitio donde hay que cambiarlo
              porque es el único hueco de primer nivel de toda la
              aplicación -- lo de dentro de cada tarjeta no se toca, que es
              justo lo que hace que compactar no apelmace el texto. */}
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-aire">{children}</div>
        </main>

        {/* En el móvil, los cinco destinos de diario a un toque. En el
            escritorio no aparece: ahí está la barra lateral entera y con
            teclado. */}
        <BottomNav />
      </div>
    </div>
  );
}
