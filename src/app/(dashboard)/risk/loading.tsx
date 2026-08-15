import { CardListSkeleton, HeaderSkeleton } from "@/components/shared/page-skeleton";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <CardListSkeleton items={4} />
    </>
  );
}
