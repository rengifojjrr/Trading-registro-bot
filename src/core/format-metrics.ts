import type { MetricsByModule } from "@/core/metrics";
import type { ModuleId } from "@/core/registry";

/**
 * Convierte las métricas crudas de un día en la línea que enseña cada
 * tarjeta.
 *
 * Vive en el núcleo y no en cada módulo por una razón concreta: la pantalla
 * de Hoy no puede importar de siete módulos sin volverse el punto por el que
 * todos se acoplan, que es justo lo que la separación quiere evitar. Lo que
 * se importa es esta función, que sólo entiende de números y claves.
 *
 * Devuelve null cuando no hay nada que decir, y entonces la tarjeta muestra
 * su texto de invitación en lugar de un cero.
 */
export function formatModuleValue(moduleId: ModuleId, metrics: MetricsByModule): string | null {
  const values = metrics[moduleId];
  if (!values) return null;

  switch (moduleId) {
    case "sleep": {
      const minutes = values["minutos"];
      if (minutes === undefined) return null;
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      const duration = h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
      const score = values["puntaje"];
      return score === undefined ? duration : `${duration} · ${score}/10`;
    }

    case "habits": {
      const done = values["completados"];
      const total = values["total"];
      if (done === undefined || total === undefined || total === 0) return null;
      return `${done} de ${total}`;
    }

    case "reading": {
      const minutes = values["minutos"] ?? 0;
      const pages = values["paginas"] ?? 0;
      if (minutes === 0 && pages === 0) return null;
      const parts = [];
      if (minutes > 0) parts.push(minutes >= 60 ? `${Math.round((minutes / 60) * 10) / 10}h` : `${minutes}m`);
      if (pages > 0) parts.push(`${pages} pág`);
      return parts.join(" · ");
    }

    case "tasks": {
      const open = values["pendientes"];
      if (open === undefined) return null;
      // Cero pendientes sí es noticia, y buena: merece decirse en lugar de
      // caer al texto de invitación.
      if (open === 0) return "Todo al día";
      const overdue = values["vencidas"] ?? 0;
      return overdue > 0 ? `${open} · ${overdue} vencidas` : `${open} pendientes`;
    }

    case "meals": {
      const meals = values["comidas"];
      if (meals === undefined || meals === 0) return null;
      return `${meals} de 3`;
    }

    case "content": {
      const queued = values["en_cola"];
      if (queued === undefined || queued === 0) return null;
      const late = values["atrasadas"] ?? 0;
      return late > 0 ? `${queued} · ${late} atrasadas` : `${queued} en cola`;
    }

    case "trading": {
      const trades = values["operaciones"];
      if (trades === undefined || trades === 0) return null;
      const net = values["resultado_neto"];
      const signed =
        net === undefined ? "" : ` · ${net >= 0 ? "+" : "-"}$${Math.abs(net).toFixed(2)}`;
      return `${trades} ${trades === 1 ? "operación" : "operaciones"}${signed}`;
    }

    default:
      return null;
  }
}
