import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A caveat banner for numbers that are real but incomplete or approximate
 * -- e.g. MFE/MAE computed from 5-minute candles, or a dashboard period
 * that includes a day the sync hadn't finished. Never hide the caveat to
 * make a screen look more finished than the data actually is.
 */
export function PartialDataNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning",
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
