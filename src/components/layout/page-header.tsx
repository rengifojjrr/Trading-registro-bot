import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        {/* Dónde estás y cómo volver un paso. Se calcula de la ruta, así que
            cada página que use esta cabecera lo tiene sin pedirlo. */}
        <Breadcrumbs />
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
