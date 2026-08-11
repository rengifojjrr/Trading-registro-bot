import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";

export default function JournalPage() {
  return (
    <>
      <PageHeader
        title="Diario"
        description="Sesión, setup, sesgo, gestión de riesgo, resultado en R y evaluación cualitativa de cada operación."
      />
      <EmptyState
        icon={BookOpen}
        title="El diario se activa junto con las operaciones reconstruidas"
        description="Los campos objetivos (producto, dirección, horarios, P&L) vienen de Coinbase y no se pueden editar aquí. Los campos subjetivos -- sesión de Tokio/Londres/Nueva York/Sídney, estrategia, sesgo de temporalidad alta, cercanía a soporte/resistencia, riesgo, stop loss, take profit, resultado en R, cumplimiento del plan, calidad de entrada, estado emocional, error cometido, lección aprendida y capturas -- se registran por operación una vez exista al menos una."
      />
    </>
  );
}
