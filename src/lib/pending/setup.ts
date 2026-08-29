import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Por dónde empezar, y si todo va bien.
 *
 * Dos preguntas que parecían distintas y son la misma lista mirada en dos
 * momentos. **El primer día**: qué falta por configurar --Coinbase, la zona
 * horaria, el producto--. **Cualquier otro día**: si eso que se configuró sigue
 * funcionando. Un panel de primeros pasos que desaparece para siempre en cuanto
 * se completa es un panel que no sirve el día que algo se rompe.
 *
 * Las piezas ya existían repartidas entre Actividad, Conciliación y
 * Configuración. Lo que faltaba era la frase de una línea que las resume, y
 * está aquí para que la calcule un solo sitio.
 */

export type StepState = "HECHO" | "PENDIENTE" | "ROTO";

export interface SetupStep {
  id: string;
  title: string;
  /** Qué significa y por qué importa. Se lee cuando está pendiente. */
  detail: string;
  state: StepState;
  href: string;
  actionLabel: string;
}

export interface SystemHealth {
  steps: SetupStep[];
  /** Cuántos quedan por hacer, para el aviso corto. */
  pendientes: number;
  /** Cuántos estaban hechos y se han roto. Éstos pesan más. */
  rotos: number;
  /** La frase de una línea: lo primero que se lee. */
  summary: string;
  /** Si es la primera vez: nada configurado y nada de datos. */
  primeraVez: boolean;
}

export async function readSystemHealth(): Promise<SystemHealth> {
  const user = await requireUser();
  const supabase = await createClient();

  const [
    { data: settings },
    { count: trades },
    { data: ultimaSync },
    { count: discrepancias },
    { count: sinDiario },
  ] = await Promise.all([
    supabase
      .from("app_settings")
      .select("timezone, active_product_id, coinbase_key_rotated_at, auto_sync_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("orphaned_at", null),
    supabase
      .from("sync_runs")
      .select("status, finished_at, error_summary")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("reconciliation_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("discrepancy_count", 0)
      .is("resolved_at", null),
    supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "CLOSED")
      .is("orphaned_at", null),
  ]);

  const steps: SetupStep[] = [
    {
      id: "zona",
      title: "Tu zona horaria",
      detail:
        "Todas las fechas se guardan en UTC y se enseñan en tu zona. Sin ella, un cierre de las 23:40 puede aparecer al día siguiente y los totales por día salen movidos.",
      state: settings?.timezone && settings.timezone !== "UTC" ? "HECHO" : "PENDIENTE",
      href: "/settings",
      actionLabel: "Elegir zona",
    },
    {
      id: "coinbase",
      title: "Conectar Coinbase",
      detail:
        "Con una clave de sólo lectura. Es lo que trae las operaciones solas: sin ella hay que importarlas a mano y el diario se queda desactualizado.",
      state: settings?.coinbase_key_rotated_at ? "HECHO" : "PENDIENTE",
      href: "/settings",
      actionLabel: "Conectar",
    },
    {
      id: "producto",
      title: "Qué producto operas",
      detail:
        "El multiplicador del contrato es lo que convierte un movimiento de precio en dinero. Sin él, todas las cifras estarían mal por el mismo factor -- que es la clase de error que no se nota porque todo parece coherente.",
      state: settings?.active_product_id ? "HECHO" : "PENDIENTE",
      href: "/settings",
      actionLabel: "Elegir producto",
    },
    {
      id: "sync",
      title: "La sincronización",
      detail:
        ultimaSync?.status === "FAILED"
          ? `La última falló${ultimaSync.error_summary ? `: ${ultimaSync.error_summary}` : "."} Hasta que vuelva a ir, lo que ves puede estar incompleto.`
          : "Trae las operaciones nuevas de Coinbase cada pocos minutos.",
      state:
        ultimaSync?.status === "FAILED"
          ? "ROTO"
          : ultimaSync
            ? "HECHO"
            : "PENDIENTE",
      href: "/activity",
      actionLabel: ultimaSync?.status === "FAILED" ? "Ver qué pasó" : "Ver actividad",
    },
    {
      id: "conciliacion",
      title: "Todo cuadra con Coinbase",
      detail:
        "La conciliación compara lo reconstruido con lo que Coinbase dice. Una discrepancia sin resolver significa que alguna cifra no se puede explicar desde los datos crudos.",
      state: discrepancias && discrepancias > 0 ? "ROTO" : "HECHO",
      href: "/reconciliation",
      actionLabel: "Revisar",
    },
    {
      id: "primera-operacion",
      title: "Tu primera operación",
      detail:
        "Aparecen solas al sincronizar. También se pueden traer de un CSV o de Notion si ya llevabas un histórico.",
      state: trades && trades > 0 ? "HECHO" : "PENDIENTE",
      href: "/import",
      actionLabel: "Importar un histórico",
    },
  ];

  const pendientes = steps.filter((s) => s.state === "PENDIENTE").length;
  const rotos = steps.filter((s) => s.state === "ROTO").length;

  return {
    steps,
    pendientes,
    rotos,
    summary: resumir(pendientes, rotos, sinDiario ?? 0),
    // Nada configurado y ninguna operación: es el primer arranque, no una
    // instalación a la que se le rompió algo.
    primeraVez: !settings?.coinbase_key_rotated_at && (trades ?? 0) === 0,
  };
}

/**
 * La frase de una línea.
 *
 * Lo roto va antes que lo pendiente: algo que funcionaba y dejó de funcionar es
 * más urgente que algo que nunca se configuró, porque en el segundo caso ya lo
 * sabías.
 */
function resumir(pendientes: number, rotos: number, sinDiario: number): string {
  if (rotos > 0) {
    return rotos === 1
      ? "Hay una cosa que dejó de funcionar."
      : `Hay ${rotos} cosas que dejaron de funcionar.`;
  }
  if (pendientes > 0) {
    return pendientes === 1
      ? "Queda una cosa por configurar."
      : `Quedan ${pendientes} cosas por configurar.`;
  }
  if (sinDiario > 0) {
    return "Todo va bien. Te faltan operaciones por apuntar en el diario.";
  }
  return "Todo va bien.";
}
