import { Target } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function StrategiesPage() {
  return (
    <>
      <PageHeader
        title="Estrategias"
        description="Reglas de cada setup y su rendimiento comparado: profit factor, expectativa, drawdown, R promedio y tamaño de muestra."
      />
      <EmptyState
        icon={Target}
        title="Todavía no hay estrategias definidas"
        description="Cuando definas una estrategia y la asignes a tus operaciones, esta sección mostrará su rendimiento -- y advertirá visualmente cuando una conclusión se base en muy pocas operaciones. Ninguna estrategia se declarará rentable solo por win rate o por una muestra pequeña."
      />
    </>
  );
}
