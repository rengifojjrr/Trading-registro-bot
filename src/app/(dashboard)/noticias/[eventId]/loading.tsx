import { CardListSkeleton, ChartSkeleton, HeaderSkeleton } from "@/components/shared/page-skeleton";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <CardListSkeleton items={2} />
      {/* Las velas de cada publicación anterior se piden a Coinbase, así que
          esta parte es la que de verdad tarda. */}
      <ChartSkeleton height="h-56" />
    </>
  );
}
