/**
 * Buscar en toda la aplicación desde un sitio.
 *
 * Había siete módulos con su propio filtro y ninguna forma de contestar «¿dónde
 * apunté aquello del retroceso?» sin abrirlos uno a uno. Un buscador global no
 * añade datos: hace que los que ya hay se puedan encontrar, que es lo que
 * separa un archivo de un montón.
 *
 * Puro: recibe los candidatos ya leídos y los ordena. Sin base de datos, para
 * que el orden se pueda probar sin montar media aplicación.
 */

export type ResultKind =
  | "trade"
  | "journal"
  | "strategy"
  | "tag"
  | "page"
  | "sleep"
  | "task"
  | "meal"
  | "reading"
  | "content"
  | "habit";

export interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  /** El texto sobre el que se buscó, que puede ser más largo que el título. */
  haystack: string;
  /** Fecha ISO para desempatar: lo reciente primero. */
  when?: string;
}

export interface RankedResult extends SearchResult {
  score: number;
}

/**
 * Cuánto encaja un resultado con lo buscado.
 *
 * Tres escalones, de más a menos exacto, en vez de una distancia difusa: con
 * pocos resultados una coincidencia aproximada estorba más de lo que ayuda,
 * porque empuja hacia abajo la que sí era.
 */
export function scoreResult(result: SearchResult, query: string): number {
  const q = normalise(query);
  if (q === "") return 0;

  const titulo = normalise(result.title);
  const texto = normalise(result.haystack);

  // Palabra a palabra: «retroceso agosto» tiene que encontrar una nota de
  // agosto que hable del retroceso, aunque las dos palabras estén lejos.
  const palabras = q.split(/\s+/).filter(Boolean);
  if (!palabras.every((p) => texto.includes(p))) return 0;

  if (titulo === q) return 100;
  if (titulo.startsWith(q)) return 80;
  if (titulo.includes(q)) return 60;
  if (texto.includes(q)) return 40;
  return 20;
}

export function rankResults(results: SearchResult[], query: string, limit = 20): RankedResult[] {
  return results
    .map((r) => ({ ...r, score: scoreResult(r, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // A igualdad, lo reciente: si escribiste dos veces sobre lo mismo, lo
      // que buscas casi siempre es la última.
      if (a.when && b.when) return b.when.localeCompare(a.when);
      if (a.when) return -1;
      if (b.when) return 1;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}

/**
 * Sin tildes y en minúsculas.
 *
 * Escribir «sueno» tiene que encontrar «sueño», y «analisis» encontrar
 * «análisis»: nadie pone tildes buscando, y un buscador que las exige parece
 * roto aunque esté haciendo exactamente lo que le pidieron.
 */
export function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Las páginas fijas, para que el buscador también sirva para navegar. */
export const PAGES: { title: string; href: string; keywords: string }[] = [
  { title: "Panel", href: "/", keywords: "dashboard inicio resumen" },
  { title: "Operaciones", href: "/trades", keywords: "trades posiciones historial" },
  { title: "Diario", href: "/journal", keywords: "journal notas" },
  { title: "Análisis", href: "/analytics", keywords: "analytics estadísticas métricas" },
  { title: "Comportamiento", href: "/behaviour", keywords: "errores rachas guion sueño hábitos adherencia" },
  { title: "Revisión semanal", href: "/review", keywords: "review semana" },
  { title: "Riesgo", href: "/risk", keywords: "límites pérdida máxima drawdown" },
  { title: "Estrategias", href: "/strategies", keywords: "setups guion playbook" },
  { title: "Validación", href: "/validation", keywords: "verificar comprobar cifras" },
  { title: "Conciliación", href: "/reconciliation", keywords: "discrepancias coinbase diferencias" },
  { title: "Actividad", href: "/activity", keywords: "avisos notificaciones registro auditoría" },
  { title: "Importar", href: "/import", keywords: "csv notion" },
  { title: "Papelera", href: "/papelera", keywords: "borrado eliminado restaurar" },
  { title: "Configuración", href: "/settings", keywords: "ajustes cuenta respaldo copia" },
  { title: "Sueño", href: "/sueno", keywords: "dormir descanso" },
  { title: "Hábitos", href: "/habitos", keywords: "rutinas" },
  { title: "Tareas", href: "/tareas", keywords: "pendientes proyectos" },
  { title: "Comidas", href: "/comidas", keywords: "alimentación recetas" },
  { title: "Lecturas", href: "/lecturas", keywords: "libros leer" },
  { title: "Contenido", href: "/contenido", keywords: "vídeos artículos" },
];

export function pageResults(): SearchResult[] {
  return PAGES.map((p) => ({
    kind: "page" as const,
    id: p.href,
    title: p.title,
    href: p.href,
    haystack: `${p.title} ${p.keywords}`,
    subtitle: "Ir a la página",
  }));
}

export const KIND_LABELS: Record<ResultKind, string> = {
  trade: "Operación",
  journal: "Diario",
  strategy: "Estrategia",
  tag: "Etiqueta",
  page: "Página",
  sleep: "Sueño",
  task: "Tarea",
  meal: "Comida",
  reading: "Lectura",
  content: "Contenido",
  habit: "Hábito",
};
