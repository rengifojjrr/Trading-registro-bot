import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import { CSV_BOM, moduleCsvFilename, rowsToCsv, type CsvColumn } from "@/lib/csv/export-rows";
import { createClient } from "@/lib/supabase/server";

/**
 * Sacar cualquier módulo a CSV.
 *
 * Trading podía exportarse desde el primer día y los siete de vida no podían de
 * ninguna forma. Una aplicación privada que no deja sacar tus propios datos es
 * una que te tiene, no una que te sirve.
 *
 * El servidor arma el archivo, no el navegador: es donde están los datos
 * completos (no sólo la página que se está viendo) y donde vive el único
 * formateador de CSV con tests. Dos formateadores del mismo dato acaban dando
 * dos respuestas distintas, y sólo uno está probado.
 */
interface ModuleExport {
  /** La tabla y las columnas que se piden. */
  table: string;
  select: string;
  /** Por dónde se ordena, de más reciente a más antiguo. */
  orderBy: string;
  columns: CsvColumn<Record<string, unknown>>[];
}

const texto = (key: string) => (row: Record<string, unknown>) => {
  const value = row[key];
  if (value === null || value === undefined) return "";
  // Un array (emociones, categorías) se une con «; » y no con coma: la coma es
  // el separador del archivo, y aunque el escapado lo aguanta, leerlo en una
  // celda con comas dentro invita a confundirlo con columnas.
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "boolean") return value ? "sí" : "no";
  return String(value);
};

const numero = (key: string) => (row: Record<string, unknown>) => {
  const value = row[key];
  return value === null || value === undefined ? "" : Number(value);
};

const MODULES: Record<string, ModuleExport> = {
  sueno: {
    table: "sleep_entries",
    select:
      "sleep_date, slept_at, woke_at, duration_minutes, score, self_reported, place, mood_on_waking, woke_how, before_bed, dream, notes",
    orderBy: "sleep_date",
    columns: [
      { header: "Fecha", value: texto("sleep_date") },
      { header: "Se acostó", value: texto("slept_at") },
      { header: "Se levantó", value: texto("woke_at") },
      { header: "Minutos dormidos", value: numero("duration_minutes") },
      { header: "Nota (1-10)", value: numero("score") },
      { header: "Estimación propia", value: texto("self_reported") },
      { header: "Lugar", value: texto("place") },
      { header: "Ánimo al despertar", value: texto("mood_on_waking") },
      { header: "Cómo despertó", value: texto("woke_how") },
      { header: "Antes de dormir", value: texto("before_bed") },
      { header: "Sueño", value: texto("dream") },
      { header: "Notas", value: texto("notes") },
    ],
  },
  habitos: {
    table: "habits_entries",
    select: "entry_date, done, habit_id",
    orderBy: "entry_date",
    columns: [
      { header: "Fecha", value: texto("entry_date") },
      { header: "Cumplido", value: texto("done") },
      { header: "Hábito", value: texto("habit_id") },
    ],
  },
  tareas: {
    table: "tasks_items",
    select: "title, status, priority, due_date, due_end, due_time, categories, notes, completed_at, created_at",
    orderBy: "created_at",
    columns: [
      { header: "Tarea", value: texto("title") },
      { header: "Estado", value: texto("status") },
      { header: "Prioridad", value: texto("priority") },
      { header: "Para el", value: texto("due_date") },
      { header: "Hasta el", value: texto("due_end") },
      { header: "Hora", value: texto("due_time") },
      { header: "Categorías", value: texto("categories") },
      { header: "Notas", value: texto("notes") },
      { header: "Completada", value: texto("completed_at") },
      { header: "Creada", value: texto("created_at") },
    ],
  },
  comidas: {
    table: "meals_entries",
    select: "meal_date, meal_type, name, notes",
    orderBy: "meal_date",
    columns: [
      { header: "Fecha", value: texto("meal_date") },
      { header: "Momento", value: texto("meal_type") },
      { header: "Comida", value: texto("name") },
      { header: "Notas", value: texto("notes") },
    ],
  },
  lecturas: {
    table: "reading_sessions",
    select: "session_date, book_id, created_at",
    orderBy: "session_date",
    columns: [
      { header: "Fecha", value: texto("session_date") },
      { header: "Libro", value: texto("book_id") },
      { header: "Registrada", value: texto("created_at") },
    ],
  },
  contenido: {
    table: "content_pieces",
    select: "title, created_at, updated_at",
    orderBy: "updated_at",
    columns: [
      { header: "Título", value: texto("title") },
      { header: "Creada", value: texto("created_at") },
      { header: "Actualizada", value: texto("updated_at") },
    ],
  },
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ module: string }> },
) {
  const { module } = await params;
  const config = MODULES[module];

  if (!config) {
    return NextResponse.json(
      { error: `No se puede exportar «${module}». Disponibles: ${Object.keys(MODULES).join(", ")}.` },
      { status: 404 },
    );
  }

  const user = await requireUser();
  const supabase = await createClient();

  // RLS ya filtra por usuario; el `eq` explícito además hace que un fallo de
  // política se note como cero filas y no como las de otro.
  const { data, error } = await supabase
    .from(config.table)
    .select(config.select)
    .eq("user_id", user.id)
    .order(config.orderBy, { ascending: false })
    .limit(10000);

  if (error) {
    return NextResponse.json({ error: "No se pudo leer los datos." }, { status: 500 });
  }

  const csv = rowsToCsv((data ?? []) as unknown as Record<string, unknown>[], config.columns);

  return new NextResponse(CSV_BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${moduleCsvFilename(module)}"`,
      // Nunca en caché: son datos propios y cambian a diario.
      "Cache-Control": "no-store",
    },
  });
}
