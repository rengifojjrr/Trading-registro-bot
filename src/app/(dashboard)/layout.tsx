import { DemoDataBanner } from "@/components/layout/demo-data-banner";
import { Sidebar } from "@/components/layout/sidebar";
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
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={user.email ?? ""} />
        <DemoDataBanner />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
