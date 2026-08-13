"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { NAV_LINKS, type NavLink as NavLinkType } from "./nav-links";

export function Sidebar() {
  const pathname = usePathname();

  const active = NAV_LINKS.filter((l) => !l.comingSoon);
  const upcoming = NAV_LINKS.filter((l) => l.comingSoon);

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-border bg-card px-3 py-4">
      <div className="mb-4 flex items-center gap-2 px-2">
        <span className="size-2 rounded-full bg-primary" />
        <span className="text-sm font-semibold tracking-wide text-foreground">Trading Registro Bot</span>
      </div>

      {active.map((link) => (
        <NavItem key={link.href} link={link} pathname={pathname} />
      ))}

      {upcoming.length > 0 ? (
        <>
          <p className="mt-4 px-2.5 pb-1 text-xs font-medium text-muted-foreground">Próximamente</p>
          {upcoming.map((link) => (
            <NavItem key={link.href} link={link} pathname={pathname} />
          ))}
        </>
      ) : null}
    </nav>
  );
}

function NavItem({ link, pathname }: { link: NavLinkType; pathname: string }) {
  const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
  const Icon = link.icon;

  return (
    <Link
      href={link.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        link.comingSoon && !isActive && "opacity-60",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {link.label}
    </Link>
  );
}
