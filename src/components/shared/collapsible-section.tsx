"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A section whose body can be folded away. Used everywhere the old UI
 * dumped every field/stat on screen at once -- the single biggest source
 * of visual noise in this app.
 *
 * `alwaysOpenOnDesktop` exists because a few sections (e.g. filters) are
 * genuinely fine expanded on a wide screen but overwhelming on a phone.
 * When set, the fold only applies below `md` and the body is always
 * rendered open at desktop widths, using pure CSS -- no JS breakpoint
 * detection, so there's no hydration mismatch or resize flicker.
 */
export function CollapsibleSection({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  alwaysOpenOnDesktop = false,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  /** Small trailing text on the trigger, e.g. an active-filter count. */
  badge?: string;
  defaultOpen?: boolean;
  alwaysOpenOnDesktop?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left",
          alwaysOpenOnDesktop && "md:hidden",
        )}
      >
        <span className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            {title}
            {badge ? <span className="text-muted-foreground"> ({badge})</span> : null}
          </span>
          {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
          aria-hidden
        />
      </button>

      <div className={cn(isOpen ? "block" : "hidden", alwaysOpenOnDesktop && "md:block")}>{children}</div>
    </div>
  );
}
