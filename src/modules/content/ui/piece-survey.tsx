"use client";

import { Check, Clapperboard } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Encuesta } from "@/core/encuesta/encuesta";
import { FichaDeRespuestas } from "@/core/encuesta/ficha";
import {
  contestadas,
  estaContestado,
  primeraSinContestar,
  type Paso,
  type Respuesta,
  type Respuestas,
} from "@/core/encuesta/pasos";
import type { Template } from "@/core/templates";
import { IconPicker } from "@/core/ui/icon-picker";
import { TemplateBar } from "@/core/ui/template-bar";
import { savePieceAnswer } from "@/modules/content/actions";
import {
  ETIQUETAS_PIEZA,
  hitosDe,
  pasosDePieza,
} from "@/modules/content/domain/encuesta";
import { EDIT_TIME_OPTIONS, RECORD_TIME_OPTIONS } from "@/modules/content/domain/content";
import type { PieceRow } from "@/modules/content/queries";

/**
 * La ficha de una pieza: se rellena preguntando y se corrige tocando.
 *
 * Era el formulario más largo de la aplicación -- veinte campos repartidos en
 * tres tramos plegados. Plegarlos fue el arreglo correcto para el problema
 * equivocado: escondía los campos, pero al abrir un tramo seguían estando
 * todos a la vez.
 *
 * Funciona como la ficha de una tarea, y por el mismo motivo: una pieza se
 * apunta en un segundo y se toca durante dos meses, mientras baja por los diez
 * estados. Así que a medio rellenar abre en la primera pregunta sin contestar,
 * y cuando ya está entera abre en su índice, donde pegar el enlace del montaje
 * es un toque y no diecisiete.
 *
 * Apuntar la idea sigue siendo un título y un botón (`ui/new-piece.tsx`).
 */

/**
 * Lo que copia una plantilla: la forma de la pieza, no su contenido.
 *
 * El título, el resumen y los enlaces son de esta pieza y de ninguna otra. Lo
 * que se repite --que sea un corto de TikTok del canal de trading, con edición
 * sencilla-- es lo que vale la pena guardar para la siguiente.
 */
const CAMPOS_DE_PLANTILLA = [
  "status",
  "content_type",
  "channels",
  "platforms",
  "edit_styles",
  "record_difficulties",
] as const;
export function PieceSurvey({
  piece,
  hoy,
  templates = [],
}: {
  piece: PieceRow;
  /** El día de hoy en la zona del usuario, desde el que cuentan los atajos. */
  hoy: string;
  templates?: Template[];
}) {
  const pasos = useMemo(() => pasosDePieza(hoy), [hoy]);

  const [respuestas, setRespuestas] = useState<Respuestas>(() => respuestasIniciales(piece));
  const [icono, setIcono] = useState(piece.icon ?? "");
  const [guardando, startSaving] = useTransition();

  const [destino, setDestino] = useState<string>(() =>
    pasos.every((p) => estaContestado(p, respuestas)) ? "" : primeraSinContestar(pasos, respuestas),
  );

  const guardar = useCallback(
    (campo: string, valor: Respuesta) => {
      startSaving(async () => {
        const { error } = await savePieceAnswer(piece.id, campo, valor);
        // Un enlace mal escrito es lo único que puede fallar por lo que
        // tecleas, y avisar es lo que impide que quede pegado uno que no
        // lleva a ninguna parte. No se revierte: lo escrito sigue en pantalla.
        if (error) toast.error(error);
      });
    },
    [piece.id],
  );

  /** Aplicar una plantilla: varios campos de un toque, cada uno por su camino. */
  const aplicar = useCallback(
    (plantilla: Template) => {
      const cambios: Respuestas = {};
      for (const campo of CAMPOS_DE_PLANTILLA) {
        const valor = plantilla.payload[campo];
        if (typeof valor === "string" && valor !== "") cambios[campo] = valor;
        if (Array.isArray(valor)) cambios[campo] = valor.map(String);
      }
      if (plantilla.body) cambios.body = plantilla.body;

      setRespuestas((previas) => ({ ...previas, ...cambios }));
      for (const [campo, valor] of Object.entries(cambios)) guardar(campo, valor);
    },
    [guardar],
  );

  const hechas = contestadas(pasos, respuestas);

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-4 flex items-center gap-2">
        <Clapperboard className="size-5" style={{ color: "var(--mod-content)" }} aria-hidden />
        <h2 className="text-lg font-medium">La pieza</h2>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
          {hechas} de {pasos.length}
        </span>
      </div>

      <Encuesta
        // Remontar al saltar: `pasoInicial` sólo se lee al montar.
        key={destino}
        pasoInicial={destino}
        pasos={pasos}
        respuestas={respuestas}
        onCambio={(campo, valor) => setRespuestas((previas) => ({ ...previas, [campo]: valor }))}
        onGuardar={guardar}
        onTerminar={() => toast.success("Pieza guardada.")}
        acento="--mod-content"
        guardando={guardando}
        final={
          <Ficha
            pasos={pasos}
            respuestas={respuestas}
            icono={icono}
            templates={templates}
            onAplicar={aplicar}
            onIr={(id) => setDestino(id)}
            onIcono={(valor) => {
              setIcono(valor);
              guardar("icon", valor);
            }}
          />
        }
      />
    </section>
  );
}

/** La ficha de la pieza: el índice común, la barra de plantillas y el icono. */
function Ficha({
  pasos,
  respuestas,
  icono,
  templates,
  onAplicar,
  onIr,
  onIcono,
}: {
  pasos: Paso[];
  respuestas: Respuestas;
  icono: string;
  templates: Template[];
  onAplicar: (plantilla: Template) => void;
  onIr: (id: string) => void;
  onIcono: (valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold leading-snug">La pieza, entera</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Toca cualquier línea para cambiar sólo eso.
        </p>
      </div>

      {/* Guardar la pieza como plantilla se hace aquí y no al apuntarla: es
          aquí donde están los campos que una plantilla copia. Al apuntar sólo
          se aplican, que es lo que hace falta para que apuntar siga siendo un
          título y un botón. */}
      <TemplateBar
        moduleId="content"
        templates={templates}
        colorToken="--mod-content"
        onApply={onAplicar}
        currentValues={() => ({
          payload: Object.fromEntries(
            CAMPOS_DE_PLANTILLA.map((campo) => [campo, respuestas[campo] ?? null]),
          ),
          body: typeof respuestas.body === "string" ? respuestas.body || null : null,
        })}
      />

      <FichaDeRespuestas
        pasos={pasos}
        respuestas={respuestas}
        etiquetas={ETIQUETAS_PIEZA}
        onIr={onIr}
      />

      <div
        className="flex flex-col gap-2 border-t border-border pt-3"
        onChangeCapture={(event) => {
          const destino = event.target as HTMLInputElement;
          if (destino.name !== "icon") return;
          if (destino.value === icono) return;
          onIcono(destino.value);
        }}
      >
        <IconPicker name="icon" defaultValue={icono || null} label="Un icono para esta pieza" />
      </div>
    </div>
  );
}

/** Lo que la pieza ya tiene escrito. */
function respuestasIniciales(piece: PieceRow): Respuestas {
  return {
    title: piece.title,
    status: piece.status,
    content_type: piece.content_type ?? "",
    channels: piece.channels,
    platforms: piece.platforms,
    planned_date: piece.planned_date ?? "",
    summary: piece.summary ?? "",
    hitos: hitosDe(piece),
    record_difficulties: piece.record_difficulties,
    record_time: etiquetaDeTiempo(piece.record_minutes, RECORD_TIME_OPTIONS, false),
    edit_time: etiquetaDeTiempo(piece.edit_minutes, EDIT_TIME_OPTIONS, piece.edit_time_uncapped),
    edit_styles: piece.edit_styles,
    edit_notes: piece.edit_notes ?? "",
    video_url: piece.video_url ?? "",
    final_url: piece.final_url ?? "",
    url: piece.url ?? "",
    notes: piece.notes ?? "",
    body: piece.body ?? "",
  };
}

/**
 * Qué etiqueta corresponde a unos minutos guardados.
 *
 * Varias etiquetas comparten minutos --«1 Dia» y «8 Horas» son ambas 480--,
 * así que la marca de «dejé de contar» decide primero y el resto se resuelve
 * por la primera coincidencia, que es la ficha que quedará marcada.
 */
function etiquetaDeTiempo(
  minutes: number | null,
  opciones: typeof RECORD_TIME_OPTIONS,
  uncapped: boolean,
): string {
  if (minutes === null) return "";
  if (uncapped) return opciones.find((o) => o.uncapped)?.label ?? "";
  return opciones.find((o) => o.minutes === minutes && !o.uncapped)?.label ?? "";
}
