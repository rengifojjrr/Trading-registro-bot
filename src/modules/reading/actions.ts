"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { BOOK_STATUSES } from "@/modules/reading/domain/reading";
import type { ImportResult } from "@/lib/notion/read-database";
import { importReadingFromNotion } from "@/modules/reading/notion-import";

export type ReadingFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

/** Rehace la cuenta del día cuando la papelera se lleva una sesión. */
export async function afterSessionRemoved(date: string): Promise<void> {
  await requireUser();
  await republishDay(date);
  revalidateReading();
}

/**
 * Vuelve a sumar el día entero desde la base.
 *
 * Puede haber varias sesiones el mismo día -- veinte minutos por la mañana y
 * cuarenta por la noche -- así que la métrica es la suma, no la última.
 */
async function republishDay(date: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reading_sessions")
    .select("minutes, pages")
    .eq("user_id", user.id)
    .eq("session_date", date);

  const minutes = (data ?? []).reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const pages = (data ?? []).reduce((sum, s) => sum + (s.pages ?? 0), 0);

  await publishDailyMetrics(date, [
    { module: "reading", key: "minutos", value: minutes, unit: "min" },
    { module: "reading", key: "paginas", value: pages },
  ]);
}

/**
 * Las preguntas de la encuesta, que aquí sí son las columnas.
 *
 * Al contrario que en sueño, donde el reloj que se contesta y el instante que
 * se guarda no son la misma cosa: una lectura no cruza la medianoche.
 */
const CAMPOS_LECTURA = [
  "session_date",
  "book_id",
  "started_at",
  "minutes",
  "pages",
  "score",
  "summary",
] as const;

type CampoLectura = (typeof CAMPOS_LECTURA)[number];

const respuestaLecturaSchema = z.object({
  session_id: emptyToNull(z.string().uuid()),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  campo: z.enum(CAMPOS_LECTURA, { message: "Pregunta desconocida." }),
  valor: z.union([z.string().max(8000), z.array(z.string().max(200)).max(40), z.number(), z.null()]),
});

export type RespuestaLectura = z.infer<typeof respuestaLecturaSchema>["valor"];

/** Un texto, o null si está en blanco: `""` haría que una pregunta saltada pareciera contestada. */
function comoTexto(valor: RespuestaLectura): string | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto === "" ? null : texto;
}

/** Un entero dentro de su rango, o null. Redondea: media página no existe. */
function comoEntero(valor: RespuestaLectura, maximo: number): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return Math.min(maximo, Math.max(0, Math.round(valor)));
}

type ParcheLectura = Partial<{
  book_id: string | null;
  started_at: string | null;
  minutes: number | null;
  pages: number | null;
  score: number | null;
  summary: string | null;
  session_date: string;
}>;

/**
 * La columna que toca esta respuesta, y sólo ella.
 *
 * Un `switch` y no una clave calculada, igual que en sueño: con
 * `{ [columna]: valor }` TypeScript deja de comprobar que lo que se escribe
 * cuadra con la columna, y aquí conviven textos, enteros y un uuid.
 */
function columnaDeLectura(campo: CampoLectura, valor: RespuestaLectura): ParcheLectura {
  switch (campo) {
    case "book_id": {
      const id = comoTexto(valor);
      // Un valor que no es un uuid es la ficha de un libro que ya no existe:
      // se guarda como «sin libro» en vez de reventar la fila entera.
      return { book_id: id !== null && z.string().uuid().safeParse(id).success ? id : null };
    }
    case "started_at":
      return { started_at: comoTexto(valor) };
    case "minutes":
      return { minutes: comoEntero(valor, 1440) };
    case "pages":
      return { pages: comoEntero(valor, 5000) };
    case "score":
      return { score: typeof valor === "number" ? Math.min(10, Math.max(0, valor)) : null };
    case "summary":
      return { summary: comoTexto(valor) };
    case "session_date": {
      const dia = comoTexto(valor);
      return dia !== null && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? { session_date: dia } : {};
    }
  }
}

/**
 * Si este parche no escribe nada.
 *
 * Mira sólo `null`, no lo que es falso: un puntaje de 0 y cero páginas son
 * respuestas, y de las informativas. Es la misma regla que usa el motor de la
 * encuesta para decidir si una pregunta está contestada.
 */
function estaVacio(parche: ParcheLectura): boolean {
  const valores = Object.values(parche);
  return valores.length === 0 || valores.every((v) => v === null || v === undefined);
}

/**
 * Una respuesta de la encuesta de lectura, guardada en cuanto se contesta.
 *
 * Es lo que permite cerrar la pestaña en la tercera pregunta sin perder las
 * dos primeras. El formulario de antes sólo escribía al pulsar el botón del
 * final, y perder el trabajo una vez es lo que hace que un formulario no se
 * vuelva a abrir.
 *
 * La diferencia con sueño es que aquí **la fila no existe todavía**: una noche
 * es una por día y se puede buscar por fecha, pero de lecturas hay las que
 * quieras el mismo día, así que no hay nada por lo que buscarla. La primera
 * respuesta la crea y devuelve su id; las siguientes ya vienen con él.
 *
 * El día es la excepción: viaja en cada guardado como el día en que se
 * archivará la fila, pero por sí solo **no la crea**. Si lo hiciera, abrir la
 * encuesta y saltárselo todo dejaría una lectura vacía cada vez -- el día
 * viene contestado de serie, y contestado de serie no es contestado.
 */
export async function saveReadingAnswer(entrada: {
  sessionId: string | null;
  sessionDate: string;
  campo: string;
  valor: RespuestaLectura;
}): Promise<ReadingFormState & { id: string | null }> {
  const user = await requireUser();

  const parsed = respuestaLecturaSchema.safeParse({
    session_id: entrada.sessionId,
    session_date: entrada.sessionDate,
    campo: entrada.campo,
    valor: entrada.valor,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      success: false,
      id: entrada.sessionId,
    };
  }

  const { session_id, session_date, campo, valor } = parsed.data;
  const parche = columnaDeLectura(campo, valor);
  const supabase = await createClient();

  if (session_id === null) {
    // El día solo no crea nada: viene contestado de serie.
    if (campo === "session_date") return { error: null, success: true, id: null };

    // Y una respuesta vacía tampoco. La encuesta manda un guardado también al
    // saltar una pregunta --así es como se borra lo que ya había escrito-- y
    // sin esto, abrirla y saltárselo todo dejaría una lectura en blanco cada
    // vez. Saltar no es contestar.
    if (estaVacio(parche)) return { error: null, success: true, id: null };

    const { data, error } = await supabase
      .from("reading_sessions")
      .insert({ user_id: user.id, session_date, ...parche })
      .select("id")
      .single();

    if (error) return { error: "No se pudo guardar la lectura.", success: false, id: null };

    await republishDay(session_date);
    revalidateReading();
    return { error: null, success: true, id: data.id };
  }

  // El día de antes, para recontarlo cuando la respuesta mueve la lectura de
  // fecha: recontar sólo el nuevo dejaría el viejo inflado para siempre.
  const { data: antes } = await supabase
    .from("reading_sessions")
    .select("session_date")
    .eq("id", session_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("reading_sessions")
    .update(parche)
    .eq("id", session_id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo guardar la lectura.", success: false, id: session_id };

  const ahora = parche.session_date ?? antes?.session_date ?? session_date;
  await republishDay(ahora);
  if (antes && antes.session_date !== ahora) await republishDay(antes.session_date);

  revalidateReading();
  revalidatePath(`/lecturas/${session_id}`);
  return { error: null, success: true, id: session_id };
}

const bookSchema = z.object({
  title: z.string().trim().min(1, "Ponle título al libro.").max(200),
  author: emptyToNull(z.string().max(120)),
  total_pages: emptyToNull(z.coerce.number().int().positive().max(50000)),
  status: z.enum(BOOK_STATUSES).default("LEYENDO"),
  icon: emptyToNull(z.string().max(8)),
});

function readBookForm(formData: FormData) {
  return bookSchema.safeParse({
    title: formData.get("title"),
    author: formData.get("author"),
    total_pages: formData.get("total_pages"),
    status: formData.get("status") || "LEYENDO",
    icon: formData.get("icon"),
  });
}

export async function createBook(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const parsed = readBookForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reading_books").insert({
    user_id: user.id,
    ...parsed.data,
    genres: formData.getAll("genres").map(String),
  });

  if (error) {
    return {
      error: error.code === "23505" ? "Ya tienes un libro con ese título." : "No se pudo guardar el libro.",
      success: false,
    };
  }

  revalidateReading();
  return { error: null, success: true };
}

/** Edita un libro entero. */
export async function updateBook(
  _prev: ReadingFormState,
  formData: FormData,
): Promise<ReadingFormState> {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Libro no encontrado.", success: false };
  }

  const parsed = readBookForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reading_books")
    .update({ ...parsed.data, genres: formData.getAll("genres").map(String) })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return {
      error:
        error.code === "23505" ? "Ya tienes un libro con ese título." : "No se pudo guardar el libro.",
      success: false,
    };
  }

  revalidateReading();
  revalidatePath(`/lecturas/libros/${id}`);
  return { error: null, success: true };
}

export async function setBookStatus(bookId: string, status: string): Promise<void> {
  const user = await requireUser();
  if (!(BOOK_STATUSES as readonly string[]).includes(status)) return;

  const supabase = await createClient();
  await supabase
    .from("reading_books")
    .update({ status: status as (typeof BOOK_STATUSES)[number] })
    .eq("id", bookId)
    .eq("user_id", user.id);

  revalidateReading();
}

/** Las pantallas de Lecturas miran los mismos datos, así que caducan a la vez. */
function revalidateReading(): void {
  revalidatePath("/lecturas");
  revalidatePath("/lecturas/libros");
  revalidatePath("/lecturas/analisis");
  revalidatePath("/");
}

/**
 * Trae los datos desde Notion.
 *
 * Se dispara a mano y no por cron: la importación es de sentido único y pisa
 * lo que haya, así que una automática que cambie algo mientras se está
 * mirando la pantalla hace que la aplicación parezca embrujada.
 */
export async function runReadingFromNotion(): Promise<ImportResult> {
  await requireUser();
  const result = await importReadingFromNotion();
  if (result.error === null) revalidateReading();
  return result;
}
