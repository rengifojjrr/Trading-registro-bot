"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { NAV_GROUPS, type NavLink as NavLinkType } from "./nav-links";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card px-3 py-4">
      <div className="mb-4 flex items-center gap-2 px-2">
        <span className="size-2 rounded-full bg-primary" />
        <span className="text-sm font-semibold tracking-wide text-foreground">Vida</span>
      </div>

      {NAV_GROUPS.map((group, index) => (
        <div key={group.title ?? `group-${index}`} className="flex flex-col gap-1">
          {group.title ? (
            <p className="mt-3 px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
          ) : null}
          {group.links.map((link) => (
            <NavItem key={link.href} link={link} pathname={pathname} />
          ))}
        </div>
      ))}
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
      )}
    >
      {/* El icono lleva el color del módulo aunque el enlace no esté activo:
          es lo que hace reconocible cada sección de un vistazo. */}
      <Icon
        className="size-4 shrink-0"
        style={link.colorToken ? { color: `var(${link.colorToken})` } : undefined}
        aria-hidden
      />
      {link.label}
    </Link>
  );
}
