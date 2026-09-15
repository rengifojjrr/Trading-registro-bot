"use client";

import { Check, MoonStar, Sunrise } from "lucide-react";
import { useCallback, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Encuesta } from "@/core/encuesta/encuesta";
import { contestadas, resumen, type Paso, type Respuesta, type Respuestas } from "@/core/encuesta/pasos";
import { IconPicker } from "@/core/ui/icon-picker";
import { cn } from "@/lib/utils";
import { saveSleepAnswer } from "@/modules/sleep/actions";
import {
  ETIQUETAS_SUENO,
  PASOS_ANTES,
  PASOS_DESPERTAR,
} from "@/modules/sleep/domain/encuesta";
import { clockFromTimestamp, formatSleepDuration } from "@/modules/sleep/domain/sleep";
import type { SleepEntryRow } from "@/modules/sleep/queries";

/**
 * Registrar una noche, de una pregunta en una pregunta.
 *
 * Eran dos formularios con once campos a la vista, y se rellenaban enteros
 * las noches que uno tenía ganas: es decir, casi ninguna. La pantalla que hay
 * que contestar a las siete de la mañana no puede pedir once cosas a la vez.
 *
 * Lo que **no** cambia, porque era lo que funcionaba:
 *
 * - **Siguen siendo dos.** Una noche no se apunta de una sentada: la de
 *   arriba antes de acostarse y la de abajo al levantarse. Cada una escribe
 *   sólo sus columnas, así que la de la mañana no puede borrar la de la noche.
 * - **Los atajos de hora.** Tocar «23:00» es una acción y escribirlo en el
 *   campo de hora de un móvil son cuatro.
 * - **La duración grande y en vivo**, en cuanto están las dos horas.
 *
 * Y lo que cambia además del formato: cada respuesta se guarda al contestarla,
 * así que quedarse dormido en la segunda pregunta ya no tira la primera.
 */

export function SleepSurvey({
  date,
  entry,
  timezone,
}: {
  date: string;
  entry: SleepEntryRow | null;
  timezone: string;
}) {
  const [antes, setAntes] = useState<Respuestas>(() => ({
    bedtime: clockFromTimestamp(entry?.slept_at ?? null, timezone),
    before_bed: entry?.before_bed ?? [],
    place: entry?.place ?? "",
  }));

  const [despertar, setDespertar] = useState<Respuestas>(() => ({
    wake_time: clockFromTimestamp(entry?.woke_at ?? null, timezone),
    score: entry?.score ?? null,
    woke_how: entry?.woke_how ?? [],
    mood_on_waking: entry?.mood_on_waking ?? [],
    self_reported: entry?.self_reported ?? "",
    dream: entry?.dream ?? "",
    notes: entry?.notes ?? "",
  }));

  const [guardando, startSaving] = useTransition();

  const guardar = useCallback(
    (id: string, valor: Respuesta) => {
      startSaving(async () => {
        const { error } = await saveSleepAnswer(date, id, valor);
        // Se avisa pero no se revierte: lo contestado sigue en pantalla y se
        // vuelve a mandar al pasar de pregunta. Borrar la respuesta de alguien
        // porque falló la red es peor que guardarla tarde.
        if (error) toast.error(error);
      });
    },
    [date],
  );

  const duracion = duracionEntre(
    typeof antes.bedtime === "string" ? antes.bedtime : "",
    typeof despertar.wake_time === "string" ? despertar.wake_time : "",
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p
          className="text-center text-4xl font-semibold tabular-nums"
          style={{ color: duracion === null ? "var(--muted-foreground)" : "var(--mod-sleep)" }}
          aria-live="polite"
        >
          {duracion === null ? "--" : formatSleepDuration(duracion)}
        </p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {duracion === null
            ? "Con las dos horas sale la duración, incluso cruzando la medianoche."
            : "Dormidas esta noche"}
        </p>
      </div>

      <Mitad
        icono={MoonStar}
        titulo="Antes de dormir"
        pasos={PASOS_ANTES}
        respuestas={antes}
        onCambio={(id, valor) => setAntes((previas) => ({ ...previas, [id]: valor }))}
        onGuardar={guardar}
        guardando={guardando}
        cierre="Que descanses."
        pieDelFinal="Mañana te preguntamos el resto."
      />

      <Mitad
        icono={Sunrise}
        titulo="Al despertar"
        pasos={PASOS_DESPERTAR}
        respuestas={despertar}
        onCambio={(id, valor) => setDespertar((previas) => ({ ...previas, [id]: valor }))}
        onGuardar={guardar}
        guardando={guardando}
        cierre="Noche apuntada."
        pieDelFinal="Ya está en tu historial y en la media."
        extraFinal={
          // El icono vive en la pantalla final y no entre las preguntas: es lo
          // que hace que reconozcas una noche en una lista sin leerla, pero
          // nadie va a abandonar la encuesta por no tenerlo, y una pregunta
          // más sí hace abandonar.
          <IconoDeLaNoche valor={entry?.icon ?? null} onGuardar={guardar} />
        }
      />
    </div>
  );
}

function Mitad({
  icono: Icono,
  titulo,
  pasos,
  respuestas,
  onCambio,
  onGuardar,
  guardando,
  cierre,
  pieDelFinal,
  extraFinal,
}: {
  icono: typeof MoonStar;
  titulo: string;
  pasos: Paso[];
  respuestas: Respuestas;
  onCambio: (id: string, valor: Respuesta) => void;
  onGuardar: (id: string, valor: Respuesta) => void;
  guardando: boolean;
  cierre: string;
  pieDelFinal: string;
  extraFinal?: ReactNode;
}) {
  const hechas = contestadas(pasos, respuestas);

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center gap-2">
        <Icono className="size-5" style={{ color: "var(--mod-sleep)" }} aria-hidden />
        <h2 className="text-lg font-medium">{titulo}</h2>
        {hechas > 0 ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" aria-hidden />
            {hechas} de {pasos.length}
          </span>
        ) : null}
      </div>

      <Encuesta
        pasos={pasos}
        respuestas={respuestas}
        onCambio={onCambio}
        onGuardar={onGuardar}
        onTerminar={() => toast.success(cierre)}
        acento="--mod-sleep"
        guardando={guardando}
        final={
          <Final
            pasos={pasos}
            respuestas={respuestas}
            titulo={cierre}
            pie={pieDelFinal}
            extra={extraFinal}
          />
        }
      />
    </section>
  );
}

function Final({
  pasos,
  respuestas,
  titulo,
  pie,
  extra,
}: {
  pasos: Paso[];
  respuestas: Respuestas;
  titulo: string;
  pie: string;
  extra?: ReactNode;
}) {
  const lineas = resumen(pasos, respuestas, ETIQUETAS_SUENO);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold leading-snug">
          {lineas.length > 0 ? titulo : "Hasta mañana"}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {lineas.length > 0 ? pie : "No has contestado nada, y no pasa nada."}
        </p>
      </div>

      {lineas.length > 0 ? (
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm">
          {lineas.map((linea) => (
            <div key={linea.etiqueta} className="flex gap-2">
              <dt className="w-28 shrink-0 text-xs text-muted-foreground">{linea.etiqueta}</dt>
              <dd className="min-w-0 flex-1 text-pretty">{linea.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {extra}
    </div>
  );
}

/**
 * El icono de la noche, guardado al tocarlo.
 *
 * `IconPicker` nació para un formulario y manda su valor en un input oculto;
 * aquí no hay formulario que enviar, así que se mira lo que escribe en ese
 * input y se guarda solo. Envolverlo es preferible a duplicar la rejilla de
 * emoji, que es lo que hace falta tener en un solo sitio.
 */
function IconoDeLaNoche({
  valor,
  onGuardar,
}: {
  valor: string | null;
  onGuardar: (id: string, valor: Respuesta) => void;
}) {
  const [actual, setActual] = useState(valor ?? "");

  return (
    <div
      className={cn("flex flex-col gap-2 border-t border-border pt-3")}
      onChangeCapture={(event) => {
        const destino = event.target as HTMLInputElement;
        if (destino.name !== "icon") return;
        if (destino.value === actual) return;
        setActual(destino.value);
        onGuardar("icon", destino.value);
      }}
    >
      <IconPicker name="icon" defaultValue={valor} label="Un icono para esta noche" />
    </div>
  );
}

/**
 * La duración en vivo, sólo para la pantalla.
 *
 * Repite la regla del servidor -- cruzar la medianoche suma un día -- porque
 * pedirla al servidor por cada tecla sería una llamada por dígito. Lo que se
 * archiva siempre lo calcula Postgres a partir de los dos instantes.
 */
function duracionEntre(bedtime: string, wakeTime: string): number | null {
  if (!bedtime || !wakeTime) return null;

  const [bedHour, bedMinute] = bedtime.split(":").map(Number);
  const [wakeHour, wakeMinute] = wakeTime.split(":").map(Number);
  if ([bedHour, bedMinute, wakeHour, wakeMinute].some(Number.isNaN)) return null;

  const bed = bedHour * 60 + bedMinute;
  const wake = wakeHour * 60 + wakeMinute;
  return wake > bed ? wake - bed : wake + 1440 - bed;
}
