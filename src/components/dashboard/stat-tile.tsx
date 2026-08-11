import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One metric tile. `description`, when given, renders an info icon with a
 * tooltip explaining the metric -- every stat on the dashboard has one, per
 * the requirement that metrics never appear without an explanation of what
 * they mean or how they're computed.
 */
export function StatTile({
  label,
  value,
  description,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  tone?: "positive" | "negative" | "neutral" | "warning";
  sub?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-1 space-y-0 pb-0">
        <CardTitle>{label}</CardTitle>
        {description ? (
          <Tooltip>
            <TooltipTrigger
              className="text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
              aria-label={`Qué significa "${label}"`}
            >
              <Info className="size-3.5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>{description}</TooltipContent>
          </Tooltip>
        ) : null}
      </CardHeader>
      <CardContent
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "warning" && "text-warning",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
        {sub ? (
          <div className="mt-0.5 text-xs font-normal text-muted-foreground">{sub}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
