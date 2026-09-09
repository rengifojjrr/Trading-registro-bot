import { CardListSkeleton, ChartSkeleton, HeaderSkeleton } from "@/components/shared/page-skeleton";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      {/* La tarjeta de «lo próximo» y luego la agenda, en ese orden: el
          esqueleto tiene que tener la forma de lo que va a llegar. */}
      <ChartSkeleton height="h-52" />
      <CardListSkeleton items={3} />
    </>
  );
}
