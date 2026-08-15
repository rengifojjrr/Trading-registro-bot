import { CardListSkeleton, ChartSkeleton, HeaderSkeleton, StatTilesSkeleton } from "@/components/shared/page-skeleton";

export default function TradeDetailLoading() {
  return (
    <>
      <HeaderSkeleton />
      <StatTilesSkeleton count={4} />
      {/* The chart is the slowest part of this page -- it waits on Coinbase. */}
      <ChartSkeleton height="h-[360px]" />
      <CardListSkeleton items={2} />
    </>
  );
}
