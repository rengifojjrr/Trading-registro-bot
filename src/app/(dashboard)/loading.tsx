import { ChartSkeleton, HeaderSkeleton, StatTilesSkeleton } from "@/components/shared/page-skeleton";

/** Fallback for any dashboard route without a more specific skeleton. */
export default function DashboardLoading() {
  return (
    <>
      <HeaderSkeleton />
      <StatTilesSkeleton />
      <ChartSkeleton />
    </>
  );
}
