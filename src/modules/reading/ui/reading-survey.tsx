"use client";

import { BookOpen, Check } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Encuesta } from "@/core/encuesta/encuesta";
import { contestadas, resumen, type Respuesta, type Respuestas } from "@/core/encuesta/pasos";
import { saveReadingAnswer } from "@/modules/reading/actions";
import {
  ETIQUETAS_LECTURA,
  pasosDeLectura,
  type LibroElegible,
} from "@/modules/reading/domain/encuesta";
import { totalsFor } from "@/modules/reading/domain/reading";
import type { BookRow, SessionRow } from "@/modules/reading/queries";

/**
 * Apuntar un rato de lectura, de una pregunta en una pregunta.
 *
 * Era un formulario de seis campos con su botón de guardar al final, y se
 * rellenaba entero las veces que uno tenía ganas. Leer veinte minutos y que
 * apuntarlo cueste más que el propio rato es la razón exacta por la que las
 * sesiones dejaban de apuntarse a los tres días.
 *
 * Lo que cambia además del formato:
 *
 * - **Cada respuesta se guarda al contestarla**, así que dejarlo a medias ya
 *   no tira lo anterior. La primera crea la lectura y las demás la van
 *   rellenando.
 * - **El ritmo en vivo**, en cuanto están los minutos y las páginas. Es la
 *   misma idea que la duración grande de sueño: enseñar ahí mismo el número
 *   que sale de lo que acabas de contestar.
 * - **Se puede apuntar el rato de ayer**, porque ahora el día es una pregunta
 *   más. Antes era un campo oculto con el día de hoy, y la lectura que no
 *   apuntaste anoche había que crearla hoy y luego editarla.
 *
 * El mismo componente registra y corrige, igual que hacía el formulario: al
 * abrir una lectura ya escrita, la encuesta arranca en la primera pregunta y
 * cada respuesta escribe encima.
 */
export function ReadingSurvey({
  date,
  books,
  session,
}: {
  /** El día de hoy en la zona del usuario, para el «Hoy» de los atajos. */
  date: string;
  books: BookRow[];
  session?: SessionRow;
}) {
  const editando = session !== undefined;

  const libros = useMemo<LibroElegible[]>(
    () => books.map((b) => ({ id: b.id, title: b.title, author: b.author, icon: b.icon, status: b.status })),
    [books],
  );

  const [vuelta, setVuelta] = useState(0);
  const [id, setId] = useState<string | null>(session?.id ?? null);
  const [respuestas, setRespuestas] = useState<Respuestas>(() => respuestasIniciales(session, date));
  const [guardando, startSaving] = useTransition();

  const pasos = useMemo(
    () => pasosDeLectura(libros, session?.session_date ?? date),
    [libros, session?.session_date, date],
  );

  const dia = typeof respuestas.session_date === "string" ? respuestas.session_date : date;

  const guardar = useCallback(
    (campo: string, valor: Respuesta) => {
      startSaving(async () => {
        const resultado = await saveReadingAnswer({ sessionId: id, sessionDate: dia, campo, valor });
        // Se avisa pero no se revierte: lo contestado sigue en pantalla y se
        // vuelve a mandar al pasar de pregunta. Borrar la respuesta de alguien
        // porque falló la red es peor que guardarla tarde.
        if (resultado.error) toast.error(resultado.error);
        // La primera respuesta crea la fila; a partir de aquí hay a quién
        // escribirle, y sin esto la segunda crearía una lectura nueva.
        if (resultado.id !== null) setId(resultado.id);
      });
    },
    [dia, id],
  );

  const hechas = contestadas(pasos, respuestas);
  const ritmo = ritmoDe(respuestas, dia);

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen className="size-5" style={{ color: "var(--mod-reading)" }} aria-hidden />
        <h2 className="text-lg font-medium">{editando ? "La lectura" : "Acabo de leer"}</h2>
        {hechas > 0 ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" aria-hidden />
            {hechas} de {pasos.length}
          </span>
        ) : null}
      </div>

      <Encuesta
        key={vuelta}
        pasos={pasos}
        respuestas={respuestas}
        onCambio={(campo, valor) => setRespuestas((previas) => ({ ...previas, [campo]: valor }))}
        onGuardar={guardar}
        onTerminar={() => toast.success(editando ? "Lectura guardada." : "Lectura apuntada.")}
        acento="--mod-reading"
        guardando={guardando}
        bajoLaPregunta={
          ritmo === null ? null : (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Te sale un ritmo de{" "}
              <span className="font-medium tabular-nums" style={{ color: "var(--mod-reading)" }}>
                {ritmo} pág/h
              </span>
              .
            </p>
          )
        }
        final={
          <Final
            respuestas={respuestas}
            pasos={pasos}
            editando={editando}
            onOtra={() => {
              setId(null);
              setRespuestas(respuestasIniciales(undefined, date));
              setVuelta((v) => v + 1);
            }}
          />
        }
      />
    </section>
  );
}

/**
 * La pantalla del final.
 *
 * Con «Apuntar otra» sólo cuando se está registrando: de lecturas hay varias
 * el mismo día --veinte minutos por la mañana y cuarenta por la noche-- y
 * obligar a recargar la página entre una y otra es justo la fricción que hace
 * que la segunda no se apunte. Corrigiendo una lectura vieja no pinta nada.
 */
function Final({
  respuestas,
  pasos,
  editando,
  onOtra,
}: {
  respuestas: Respuestas;
  pasos: ReturnType<typeof pasosDeLectura>;
  editando: boolean;
  onOtra: () => void;
}) {
  const lineas = resumen(pasos, respuestas, ETIQUETAS_LECTURA);

  // El día viene contestado de serie, así que por sí solo no significa que se
  // haya apuntado nada. Sin esto, saltárselo todo acaba en un «Lectura
  // apuntada» y un resumen que sólo dice «Hoy» -- y no hay ninguna lectura,
  // porque el servidor tampoco crea la fila con el día solo.
  const hayLectura = lineas.some((l) => l.etiqueta !== ETIQUETAS_LECTURA.session_date);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold leading-snug">
          {hayLectura ? (editando ? "Lectura guardada." : "Lectura apuntada.") : "Otro día será"}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {hayLectura
            ? "Ya cuenta en los totales y en el ritmo del mes."
            : "No has contestado nada, y no pasa nada."}
        </p>
      </div>

      {hayLectura ? (
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm">
          {lineas.map((linea) => (
            <div key={linea.etiqueta} className="flex gap-2">
              <dt className="w-28 shrink-0 text-xs text-muted-foreground">{linea.etiqueta}</dt>
              <dd className="min-w-0 flex-1 text-pretty">{linea.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {editando ? null : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onOtra}>
            Apuntar otra lectura
          </Button>
        </div>
      )}
    </div>
  );
}

/** Lo que ya hay escrito, o el día de hoy y nada más. */
function respuestasIniciales(session: SessionRow | undefined, hoy: string): Respuestas {
  return {
    // El día viene contestado de serie porque casi siempre es hoy. Que sea una
    // pregunta y no un campo oculto es lo que deja apuntar lo de ayer.
    session_date: session?.session_date ?? hoy,
    book_id: session?.book_id ?? "",
    minutes: session?.minutes ?? null,
    pages: session?.pages ?? null,
    score: session?.score ?? null,
    summary: session?.summary ?? "",
    // La hora llega de Postgres como «21:30:00» y el campo de hora del
    // navegador sólo entiende «21:30».
    started_at: session?.started_at ? session.started_at.slice(0, 5) : "",
  };
}

/**
 * El ritmo, en vivo.
 *
 * Con la regla del módulo y no una cuenta a mano: `totalsFor` es quien sabe
 * que por debajo de diez minutos no sale un ritmo creíble sino un número
 * grande, y tener esa regla en dos sitios es tenerla en ninguno.
 */
function ritmoDe(respuestas: Respuestas, dia: string): number | null {
  const minutes = typeof respuestas.minutes === "number" ? respuestas.minutes : null;
  const pages = typeof respuestas.pages === "number" ? respuestas.pages : null;
  if (minutes === null || pages === null) return null;
  return totalsFor([{ minutes, pages, sessionDate: dia }]).pagesPerHour;
}
