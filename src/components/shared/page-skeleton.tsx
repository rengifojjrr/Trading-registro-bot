import { Skeleton } from "@/components/shared/loading-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Shapes used by the route-level loading.tsx files.
 *
 * Every page in this app awaits several Supabase queries before it renders
 * anything, so without these the browser sat on the previous screen until
 * the slowest one came back. These deliberately mirror the real layout's
 * proportions -- a skeleton that doesn't match what replaces it reads as a
 * second layout shift rather than as progress.
 */

export function HeaderSkeleton({ withDescription = true }: { withDescription?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-48" />
      {withDescription ? <Skeleton className="h-4 w-full max-w-xl" /> : null}
    </div>
  );
}

export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-2 pt-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`w-full ${height}`} />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5">
        <Skeleton className="h-9 w-full max-w-sm" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export function CardListSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: items }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex flex-col gap-2 pt-5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
