import type { EventImportance } from "./types";

/**
 * Cómo se escriben y se leen los números de una publicación macro.
 *
 * Sin efectos ni dependencias: lo prueba `format.test.ts` y lo usan tanto la
 * pantalla como el aviso, para que las dos digan exactamente lo mismo.
 */

/**
 * «205K», «0,4 %», «—».
 *
 * La escala y la unidad vienen separadas del número y las dos hacen falta:
 * sin la escala, 205 000 despidos se leen como doscientos cinco.
 *
 * Un guion largo cuando no hay dato, y nunca un cero. Que el IPC de mañana
 * todavía no exista y que el IPC de mañana sea cero son cosas distintas, y
 * ésta es una aplicación en la que confundirlas cuesta dinero.
 */
export function formatEventValue(
  value: number | null,
  unit: string | null,
  scale: string | null,
): string {
  if (value === null) return "—";

  // Máximo dos decimales, pero sin obligar a dos: «0,4 %» y no «0,40 %», que
  // es como lo publica la fuente y como lo enseña cualquier calendario.
  const numero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
  const conEscala = scale ? `${numero}${scale}` : numero;
  // El porcentaje va pegado en español («0,4 %» lleva espacio fino, pero en
  // una tabla estrecha pega peor de lo que ayuda).
  return unit ? `${conEscala}${unit}` : conEscala;
}

export type SurpriseDirection = "ARRIBA" | "ABAJO" | "EN_LINEA";

export interface Surprise {
  direction: SurpriseDirection;
  /** El tamaño de la desviación, en las unidades del propio indicador. */
  diff: number;
}

/**
 * En qué se desvió el dato real de lo que se esperaba.
 *
 * Devuelve la desviación del **dato**, no una predicción del mercado: que el
 * IPC salga por encima de lo previsto es un hecho; qué le hace eso a Bitcoin
 * no lo es, y esta aplicación no inventa números.
 *
 * Null cuando falta cualquiera de los dos: sin previsión no hay sorpresa que
 * medir, sólo un dato.
 */
export function surpriseOf(actual: number | null, forecast: number | null): Surprise | null {
  if (actual === null || forecast === null) return null;

  const diff = actual - forecast;
  // Comparación exacta a propósito: los dos números vienen de la misma fuente
  // con la misma precisión, así que no hay error de redondeo que absorber.
  if (diff === 0) return { direction: "EN_LINEA", diff: 0 };
  return { direction: diff > 0 ? "ARRIBA" : "ABAJO", diff };
}

/** Una frase para el aviso: «salió por encima de lo previsto (0,4 % frente a 0,3 %)». */
export function describeSurprise(
  surprise: Surprise,
  actual: number,
  forecast: number,
  unit: string | null,
  scale: string | null,
): string {
  const real = formatEventValue(actual, unit, scale);
  const previsto = formatEventValue(forecast, unit, scale);
  if (surprise.direction === "EN_LINEA") return `salió en línea con lo previsto (${real})`;
  const sentido = surprise.direction === "ARRIBA" ? "por encima" : "por debajo";
  return `salió ${sentido} de lo previsto (${real} frente a ${previsto})`;
}

export const IMPORTANCE_LABELS: Record<EventImportance, string> = {
  1: "Alto impacto",
  0: "Impacto medio",
  [-1]: "Impacto bajo",
};

/** La versión corta, para una etiqueta estrecha. */
export const IMPORTANCE_SHORT: Record<EventImportance, string> = {
  1: "Alto",
  0: "Medio",
  [-1]: "Bajo",
};

/**
 * Cuánto falta, dicho como lo diría una persona.
 *
 * Redondea hacia abajo a propósito: «falta 1 h» cuando quedan 119 minutos es
 * lo que uno espera oír, y «faltan 2 h» invitaría a estirar la espera.
 * Devuelve null para lo ya pasado -- de eso se encarga quien llama, porque un
 * evento pasado se cuenta de otra forma.
 */
export function formatCountdown(msRemaining: number): string | null {
  if (msRemaining <= 0) return null;

  const minutos = Math.floor(msRemaining / 60_000);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const restoMinutos = minutos % 60;
  if (horas < 24) return restoMinutos > 0 ? `${horas} h ${restoMinutos} min` : `${horas} h`;

  const dias = Math.floor(horas / 24);
  const restoHoras = horas % 24;
  if (dias === 1) return restoHoras > 0 ? `1 día ${restoHoras} h` : "1 día";
  return restoHoras > 0 ? `${dias} días ${restoHoras} h` : `${dias} días`;
}
