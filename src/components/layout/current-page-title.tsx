"use client";

import { usePathname } from "next/navigation";

import { NAV_LINKS } from "./nav-links";

/**
 * Shows which section you're in, on small screens only. The desktop
 * sidebar already highlights the active link, but on a phone the sidebar
 * is behind a hamburger, so the header read as three anonymous icons with
 * no indication of where you were.
 *
 * Longest matching href wins so nested routes (e.g. /trades/<id>) resolve
 * to their section rather than to "/" -- which every path starts with.
 */
export function CurrentPageTitle() {
  const pathname = usePathname();

  const match = NAV_LINKS.filter((link) => (link.href === "/" ? pathname === "/" : pathname.startsWith(link.href))).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];

  if (!match) return null;

  return <span className="text-sm font-medium text-foreground md:hidden">{match.label}</span>;
}
