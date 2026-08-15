import { HeaderSkeleton, TableSkeleton } from "@/components/shared/page-skeleton";

export default function TradesLoading() {
  return (
    <>
      <HeaderSkeleton />
      <TableSkeleton rows={10} />
    </>
  );
}
