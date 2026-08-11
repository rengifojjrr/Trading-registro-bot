import { Bell } from "lucide-react";
import Link from "next/link";

import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export async function Topbar({ userEmail }: { userEmail: string }) {
  const supabase = await createClient();
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        <MobileNav />
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" asChild className="relative" aria-label="Actividad">
          <Link href="/activity">
            <Bell className="size-4" />
            {unreadCount ? (
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-negative" />
            ) : null}
          </Link>
        </Button>
        <UserMenu email={userEmail} />
      </div>
    </header>
  );
}
