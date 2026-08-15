import Link from "next/link";
import type { ReactNode } from "react";

import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One metric tile. `description`, when given, renders an info hint
 * explaining the metric -- every stat has one, per the requirement that
 * metrics never appear without an explanation of how they're computed.
 *
 * `size` carries the visual hierarchy: "lg" for the handful of numbers
 * that answer "how am I doing?" at a glance, "sm" for the supporting
 * detail. Previously every tile was identical, so a headline figure like
 * net P&L competed for attention with a minor one like longest streak.
 */
export function StatTile({
  label,
  value,
  description,
  tone = "neutral",
  sub,
  size = "sm",
  provenanceHref,
  provenanceLabel,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  tone?: "positive" | "negative" | "neutral" | "warning";
  sub?: ReactNode;
  size?: "sm" | "lg";
  /**
   * Where the underlying rows live. Turns the tile from a number you have
   * to trust into one you can open and count yourself -- the same filters
   * that produced it, applied to the trades list.
   */
  provenanceHref?: string;
  provenanceLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-1 space-y-0 pb-0">
        <CardTitle>{label}</CardTitle>
        {description ? <InfoHint label={label}>{description}</InfoHint> : null}
      </CardHeader>
      <CardContent
        className={cn(
          "font-semibold tabular-nums",
          size === "lg" ? "text-2xl" : "text-lg",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "warning" && "text-warning",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
        {sub ? <div className="mt-0.5 text-xs font-normal text-muted-foreground">{sub}</div> : null}
        {provenanceHref ? (
          <Link
            href={provenanceHref}
            className="mt-1 inline-block text-xs font-normal text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
          >
            {provenanceLabel ?? "Ver las operaciones"}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
