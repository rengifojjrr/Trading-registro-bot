import { FileText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reportes mensuales"
        description="Resumen automático al cierre de cada mes: resultados, comparación con meses anteriores, sesiones y días más rentables, comisiones y evolución del capital."
      />
      <EmptyState
        icon={FileText}
        title="El primer reporte se genera al cierre del primer mes con operaciones"
        description="La sincronización con Coinbase sigue corriendo cada ~5 minutos independientemente de este reporte -- el reporte mensual es un consolidado, no el mecanismo principal de importación."
      />
    </>
  );
}
