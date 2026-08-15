import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Shown for an unknown URL, and by any page that calls notFound(). */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Esta página no existe</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Puede que la operación se haya eliminado, o que el enlace esté mal escrito.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Volver al dashboard</Link>
      </Button>
    </div>
  );
}
