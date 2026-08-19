import { Bell } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { AppearanceLauncher } from "@/components/layout/appearance-launcher";
import { Button } from "@/components/ui/button";
import { readAppearance } from "@/lib/appearance/storage";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { CurrentPageTitle } from "./current-page-title";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export async function Topbar({ userEmail }: { userEmail: string }) {
  const user = await requireUser();
  const supabase = await createClient();
  const store = await cookies();
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <MobileNav />
        <CurrentPageTitle />
      </div>

      <div className="flex items-center gap-1">
        <AppearanceLauncher appearance={readAppearance((name) => store.get(name)?.value)} />
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="relative"
          aria-label={unreadCount ? `Actividad, ${unreadCount} sin leer` : "Actividad"}
        >
          <Link href="/activity">
            <Bell className="size-4" />
            {unreadCount ? (
              // The count itself, not just a dot -- "something happened" and
              // "nine things happened" are different situations.
              <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-medium text-negative-foreground tabular-nums">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Link>
        </Button>
        <UserMenu email={userEmail} />
      </div>
    </header>
  );
}
