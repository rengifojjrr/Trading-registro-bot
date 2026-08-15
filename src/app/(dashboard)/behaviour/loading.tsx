import { CardListSkeleton, HeaderSkeleton, StatTilesSkeleton } from "@/components/shared/page-skeleton";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <StatTilesSkeleton />
      <CardListSkeleton items={3} />
    </>
  );
}
