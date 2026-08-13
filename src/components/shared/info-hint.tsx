"use client";

import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The "ℹ️" affordance used to move long explanatory copy out of the page
 * body and behind a hint, so screens stay scannable.
 *
 * Deliberately controlled rather than using Radix's default behavior:
 * Radix's tooltip trigger bails out of its open-on-pointer-move handler
 * when `pointerType === "touch"`, so an uncontrolled tooltip is literally
 * unreachable on a phone -- the hint would be invisible to exactly the
 * users who have the least screen space for inline copy. Toggling open
 * state on click (and preventing Radix's own close-on-pointerdown /
 * close-on-click handlers via preventDefault, which its composeEventHandlers
 * honors) makes tap work on touch while hover still works with a mouse and
 * focus still works with a keyboard.
 */
export function InfoHint({
  label,
  children,
  className,
}: {
  /** What the hint explains -- used for the screen-reader accessible name. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        type="button"
        aria-label={`Qué significa "${label}"`}
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex shrink-0 text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
