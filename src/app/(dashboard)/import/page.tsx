import { Upload } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Importar histórico"
        description="Respaldo por CSV con previsualización, detección de duplicados y mapeo de columnas -- además de la importación automática por API."
      />
      <EmptyState
        icon={Upload}
        title="El asistente de importación CSV llega en la Fase 5"
        description="Primero se valida el motor de reconstrucción contra datos reales de la API; el importador CSV comparte esa misma lógica de reconstrucción para no crear un camino de cálculo paralelo."
      />
    </>
  );
}
