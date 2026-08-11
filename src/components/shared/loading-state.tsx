import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Cargando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border px-6 py-16 text-center",
        className,
      )}
    >
      <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/** Skeleton block for inline loading (stat tiles, table rows, chart areas). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
