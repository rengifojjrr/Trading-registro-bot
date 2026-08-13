import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 px-6 text-center">
      <FileQuestion className="size-10 text-muted-foreground" aria-hidden />
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-foreground">No encontramos esta página</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Puede que la operación que buscabas ya no exista, o que el enlace esté incompleto.
        </p>
      </div>
      <Button size="sm" asChild>
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
