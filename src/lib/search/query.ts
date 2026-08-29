"use server";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { actionResults, pageResults, rankResults, type RankedResult, type SearchResult } from "./rank";

/**
 * Lo que hay en toda la aplicación que encaje con lo escrito.
 *
 * Se buscan a la vez las cosas y las páginas: escribir «riesgo» tiene que
 * llevar a la página de Riesgo igual que «BIT-31OCT26» lleva a una operación.
 * Un buscador que solo encuentra filas obliga a saberse el menú de memoria.
 *
 * El filtrado fino y el orden los hace `rank.ts`, que es puro y está cubierto
 * por tests. Aquí solo se traen candidatos, con un `ilike` amplio para que el
 * ordenador de verdad tenga con qué trabajar.
 */
export async function searchEverything(query: string): Promise<RankedResult[]> {
  const texto = query.trim();
  // Con una sola letra saldría media base de datos y no serviría de nada.
  if (texto.length < 2) return [];

  const user = await requireUser();
  const supabase = await createClient();
  const patron = `%${sanitiseForFilter(texto)}%`;

  // Los ocho módulos, no dos.
  //
  // El buscador solo miraba trading y tareas: sueño, hábitos, comidas,
  // lecturas y contenido no se encontraban de ninguna forma. «Buscar en todo»
  // que solo busca en un cuarto de la aplicación es peor que no tenerlo,
  // porque enseña que lo que no aparece no está.
  // Faltaban las noches, las sesiones de lectura y los comentarios de una
  // operación. Los dos últimos son donde vive la mitad de lo que uno escribe
  // -- el resumen de un libro, la discusión sobre una operación -- y no se
  // encontraban de ninguna forma.
  const [
    trades,
    journals,
    strategies,
    tags,
    tasks,
    meals,
    readings,
    contents,
    habits,
    sleeps,
    sessions,
    comments,
  ] =
    await Promise.all([
    supabase
      .from("trades")
      .select("id, product_id, direction, opened_at, status")
      .eq("user_id", user.id)
      .is("orphaned_at", null)
      .ilike("product_id", patron)
      .order("opened_at", { ascending: false })
      .limit(20),
    supabase
      .from("journal_entries")
      .select("id, trade_id, notes, lesson_learned, updated_at")
      .eq("user_id", user.id)
      .or(`notes.ilike.${patron},lesson_learned.ilike.${patron}`)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("strategies")
      .select("id, name, description")
      .eq("user_id", user.id)
      .ilike("name", patron)
      .limit(10),
    supabase.from("tags").select("id, name").eq("user_id", user.id).ilike("name", patron).limit(10),
    supabase
      .from("tasks_items")
      .select("id, title, notes, updated_at")
      .eq("user_id", user.id)
      .or(`title.ilike.${patron},notes.ilike.${patron}`)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("meals_entries")
      .select("id, name, notes, meal_date, meal_type")
      .eq("user_id", user.id)
      .or(`name.ilike.${patron},notes.ilike.${patron}`)
      .order("meal_date", { ascending: false })
      .limit(10),
    supabase
      .from("reading_books")
      .select("id, title, author")
      .eq("user_id", user.id)
      .or(`title.ilike.${patron},author.ilike.${patron}`)
      .limit(10),
    supabase
      .from("content_pieces")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .ilike("title", patron)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("habits_definitions")
      .select("id, name")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .ilike("name", patron)
      .limit(10),
    supabase
      .from("sleep_entries")
      .select("id, sleep_date, notes, duration_minutes")
      .eq("user_id", user.id)
      .ilike("notes", patron)
      .order("sleep_date", { ascending: false })
      .limit(10),
    supabase
      .from("reading_sessions")
      .select("id, session_date, summary, minutes")
      .eq("user_id", user.id)
      .ilike("summary", patron)
      .order("session_date", { ascending: false })
      .limit(10),
    supabase
      .from("trade_comments")
      .select("id, trade_id, body, created_at")
      .eq("user_id", user.id)
      .ilike("body", patron)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const candidatos: SearchResult[] = [...pageResults(), ...actionResults()];

  for (const t of trades.data ?? []) {
    candidatos.push({
      kind: "trade",
      id: t.id,
      title: `${t.product_id} ${t.direction === "LONG" ? "largo" : "corto"}`,
      subtitle: `${t.opened_at.slice(0, 10)}${t.status === "OPEN" ? " · abierta" : ""}`,
      href: `/trades/${t.id}`,
      haystack: `${t.product_id} ${t.direction} ${t.opened_at.slice(0, 10)}`,
      when: t.opened_at,
    });
  }

  for (const j of journals.data ?? []) {
    const cuerpo = j.lesson_learned || j.notes || "";
    candidatos.push({
      kind: "journal",
      id: j.id,
      // El diario no tiene título, así que el título es la primera línea: es
      // lo que reconoces de un vistazo cuando la escribiste tú.
      title: firstLine(cuerpo),
      subtitle: "Nota del diario",
      href: `/trades/${j.trade_id}`,
      haystack: `${j.notes ?? ""} ${j.lesson_learned ?? ""}`,
      when: j.updated_at,
    });
  }

  for (const s of strategies.data ?? []) {
    candidatos.push({
      kind: "strategy",
      id: s.id,
      title: s.name,
      subtitle: s.description ? firstLine(s.description) : "Estrategia",
      href: "/strategies",
      haystack: `${s.name} ${s.description ?? ""}`,
    });
  }

  for (const t of tags.data ?? []) {
    candidatos.push({
      kind: "tag",
      id: t.id,
      title: t.name,
      subtitle: "Etiqueta",
      href: `/trades?tags=${encodeURIComponent(t.name)}`,
      haystack: t.name,
    });
  }

  for (const t of tasks.data ?? []) {
    candidatos.push({
      kind: "task",
      id: t.id,
      title: t.title,
      subtitle: "Tarea",
      href: `/tareas/${t.id}`,
      haystack: `${t.title} ${t.notes ?? ""}`,
      when: t.updated_at,
    });
  }

  for (const m of meals.data ?? []) {
    candidatos.push({
      kind: "meal",
      id: m.id,
      title: m.name,
      subtitle: `${m.meal_type.charAt(0)}${m.meal_type.slice(1).toLowerCase()} · ${m.meal_date}`,
      href: `/comidas/${m.id}`,
      haystack: `${m.name} ${m.notes ?? ""}`,
      when: m.meal_date,
    });
  }

  for (const b of readings.data ?? []) {
    candidatos.push({
      kind: "reading",
      id: b.id,
      title: b.title,
      subtitle: b.author ?? "Libro",
      href: `/lecturas/libros/${b.id}`,
      haystack: `${b.title} ${b.author ?? ""}`,
    });
  }

  for (const c of contents.data ?? []) {
    candidatos.push({
      kind: "content",
      id: c.id,
      title: c.title,
      subtitle: "Pieza",
      href: `/contenido/${c.id}`,
      haystack: c.title,
      when: c.updated_at,
    });
  }

  for (const h of habits.data ?? []) {
    candidatos.push({
      kind: "habit",
      id: h.id,
      title: h.name,
      subtitle: "Hábito",
      href: `/habitos/${h.id}`,
      haystack: h.name,
    });
  }

  for (const noche of sleeps.data ?? []) {
    const horas = noche.duration_minutes === null ? null : (noche.duration_minutes / 60).toFixed(1);
    candidatos.push({
      kind: "sleep",
      id: noche.id,
      title: horas ? `Noche del ${noche.sleep_date} · ${horas} h` : `Noche del ${noche.sleep_date}`,
      subtitle: noche.notes ? firstLine(noche.notes) : undefined,
      href: `/sueno/historial/${noche.id}`,
      haystack: `${noche.sleep_date} ${noche.notes ?? ""}`,
    });
  }

  for (const sesion of sessions.data ?? []) {
    candidatos.push({
      kind: "reading",
      id: sesion.id,
      title: sesion.minutes
        ? `Lectura del ${sesion.session_date} · ${sesion.minutes} min`
        : `Lectura del ${sesion.session_date}`,
      subtitle: sesion.summary ? firstLine(sesion.summary) : undefined,
      href: `/lecturas/${sesion.id}`,
      haystack: `${sesion.session_date} ${sesion.summary ?? ""}`,
    });
  }

  for (const comentario of comments.data ?? []) {
    candidatos.push({
      kind: "journal",
      id: comentario.id,
      // Se enseña como lo que es -- un comentario -- pero lleva a la
      // operación: un comentario suelto, fuera de ella, no dice nada.
      title: "Comentario en una operación",
      subtitle: firstLine(comentario.body),
      href: `/trades/${comentario.trade_id}`,
      haystack: comentario.body,
    });
  }

  return rankResults(candidatos, texto);
}

/**
 * Lo escrito, sin lo que rompe la sintaxis de filtros de PostgREST.
 *
 * `.or()` recibe una cadena donde la coma separa condiciones y los paréntesis
 * las agrupan: buscar «entré tarde, salí pronto» partiría el filtro por la coma
 * y el segundo trozo se leería como otra condición. No es solo un resultado
 * raro -- es texto de fuera decidiendo la forma de la consulta.
 *
 * Se sustituyen por el comodín de un carácter, así que la búsqueda sigue
 * encontrando la frase entera en vez de fallar o devolver cualquier cosa.
 */
function sanitiseForFilter(value: string): string {
  return value.replace(/[,()*\\%]/g, "_");
}

function firstLine(text: string): string {
  const linea = text.split("\n").find((l) => l.trim() !== "") ?? text;
  return linea.trim().slice(0, 90) || "Sin texto";
}
