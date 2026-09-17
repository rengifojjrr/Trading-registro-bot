"use client";

import { Check, UtensilsCrossed } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Encuesta } from "@/core/encuesta/encuesta";
import { contestadas, resumen, type Respuesta, type Respuestas } from "@/core/encuesta/pasos";
import type { Template } from "@/core/templates";
import { IconPicker } from "@/core/ui/icon-picker";
import { TemplateBar } from "@/core/ui/template-bar";
import { saveMealAnswer } from "@/modules/meals/actions";
import {
  ETIQUETAS_COMIDA,
  pasosDeComida,
  puedeNacer,
} from "@/modules/meals/domain/encuesta";
import type { MealType } from "@/modules/meals/domain/meals";
import type { MealRow } from "@/modules/meals/queries";

/**
 * Apuntar una comida, de una pregunta en una pregunta.
 *
 * Eran seis campos a la vista. Menos que el diario de una operación, pero la
 * comida se apunta tres veces al día: lo que en trading cuesta una vez por
 * operación, aquí cuesta veintiuna por semana.
 *
 * Lo que **no** cambia, porque era lo que funcionaba:
 *
 * - **Las plantillas siguen arriba y siguen siendo un toque.** Se come lo
 *   mismo muchas veces, y el desayuno de casi todos los días no debería costar
 *   lo mismo que uno nuevo. Meterlas dentro de la encuesta las habría
 *   convertido en una pregunta más -- justo lo que vienen a ahorrar.
 * - **Los ingredientes son un bloque de texto**, uno por línea. Una pregunta
 *   por ingrediente sería la forma más rápida de que nadie los apunte, y de
 *   ahí sale la lista de la compra.
 * - **El día se puede echar hacia delante**, porque esto es un planificador y
 *   no sólo un diario.
 *
 * Y lo que cambia además del formato: cada respuesta se guarda al contestarla,
 * así que abandonar a media comida ya no tira lo anterior.
 */
export function MealSurvey({
  date,
  hoy,
  defaultType = "ALMUERZO",
  meal,
  templates,
}: {
  /** El día del hueco desde el que se entra. */
  date: string;
  /** El día de hoy en la zona del usuario, para el «Hoy» de los atajos. */
  hoy: string;
  defaultType?: MealType;
  meal?: MealRow;
  /** Sin plantillas, la barra no se pinta: un módulo puede vivir sin ellas. */
  templates?: Template[];
}) {
  const editando = meal !== undefined;

  const [vuelta, setVuelta] = useState(0);
  const [id, setId] = useState<string | null>(meal?.id ?? null);
  const [respuestas, setRespuestas] = useState<Respuestas>(() =>
    respuestasIniciales(meal, date, defaultType),
  );
  const [icono, setIcono] = useState(meal?.icon ?? "");
  const [guardando, startSaving] = useTransition();

  const pasos = useMemo(() => pasosDeComida(hoy), [hoy]);

  /**
   * Guarda respuestas en orden, enhebrando el id que devuelve la primera.
   *
   * En cuanto la comida nace deja de recorrer: la fila se crea con **todo** lo
   * contestado, así que las demás ya están escritas y repetirlas sería pedirle
   * al servidor que vuelva a escribir lo mismo.
   */
  const guardarVarias = useCallback(
    (nuevas: Respuestas, campos: string[]) => {
      startSaving(async () => {
        let actual = id;
        for (const campo of campos) {
          const r = await saveMealAnswer({
            mealId: actual,
            campo,
            valor: nuevas[campo] ?? null,
            respuestas: nuevas,
          });
          // Se avisa pero no se revierte: lo contestado sigue en pantalla y se
          // vuelve a mandar al pasar de pregunta.
          if (r.error) {
            toast.error(r.error);
            return;
          }
          if (r.id !== null && actual === null) {
            actual = r.id;
            setId(r.id);
            return;
          }
        }
      });
    },
    [id],
  );

  const guardar = useCallback(
    (campo: string, valor: Respuesta) => {
      // Con el valor recién contestado dentro: el estado de React todavía no lo
      // tiene cuando el motor avisa, y la comida nace justo de esa respuesta.
      guardarVarias({ ...respuestas, [campo]: valor }, [campo]);
    },
    [guardarVarias, respuestas],
  );

  const hechas = contestadas(pasos, respuestas);
  const nombre = typeof respuestas.name === "string" ? respuestas.name : "";

  return (
    <section className="flex flex-col gap-4">
      {templates ? (
        <TemplateBar
          moduleId="meals"
          templates={templates}
          colorToken="--mod-meals"
          onApply={(template) => {
            const p = template.payload;
            const cambios: Respuestas = {};
            if (typeof p.name === "string") cambios.name = p.name;
            if (typeof p.meal_type === "string") cambios.meal_type = p.meal_type;
            // El cuerpo de la plantilla son los ingredientes: es lo que de
            // verdad se repite y lo que más cuesta volver a teclear.
            if (template.body) cambios.ingredients = template.body;

            const nuevas = { ...respuestas, ...cambios };
            setRespuestas(nuevas);
            // El nombre primero: es el que puede hacer nacer la comida, y al
            // nacer se lleva los ingredientes y el tipo con él.
            guardarVarias(nuevas, ["name", "meal_type", "ingredients"].filter((c) => c in cambios));
          }}
          currentValues={() => ({
            payload: { name: nombre, meal_type: respuestas.meal_type },
            body: typeof respuestas.ingredients === "string" ? respuestas.ingredients || null : null,
          })}
        />
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <div className="mb-4 flex items-center gap-2">
          <UtensilsCrossed className="size-5" style={{ color: "var(--mod-meals)" }} aria-hidden />
          <h2 className="text-lg font-medium">{editando ? "La comida" : "Nueva comida"}</h2>
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
          onTerminar={() =>
            puedeNacer(respuestas)
              ? toast.success(editando ? "Comida guardada." : "Comida apuntada.")
              : undefined
          }
          acento="--mod-meals"
          guardando={guardando}
          final={
            <Final
              respuestas={respuestas}
              pasos={pasos}
              editando={editando}
              icono={icono}
              onIcono={(valor) => {
                setIcono(valor);
                guardarVarias({ ...respuestas, icon: valor }, ["icon"]);
              }}
              onOtra={() => {
                setId(null);
                setRespuestas(respuestasIniciales(undefined, date, defaultType));
                setIcono("");
                setVuelta((v) => v + 1);
              }}
            />
          }
        />
      </div>
    </section>
  );
}

function Final({
  respuestas,
  pasos,
  editando,
  icono,
  onIcono,
  onOtra,
}: {
  respuestas: Respuestas;
  pasos: ReturnType<typeof pasosDeComida>;
  editando: boolean;
  icono: string;
  onIcono: (valor: string) => void;
  onOtra: () => void;
}) {
  const lineas = resumen(pasos, respuestas, ETIQUETAS_COMIDA);
  // Sin nombre no hay comida guardada, por mucho que se hayan contestado el
  // tipo y el día -- que vienen puestos. Decir «apuntada» cuando el servidor no
  // ha creado nada es peor que no decir nada.
  const hayComida = puedeNacer(respuestas);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold leading-snug">
          {hayComida ? (editando ? "Comida guardada." : "Comida apuntada.") : "Sin comida, entonces"}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {hayComida
            ? "Ya sale en la semana y sus ingredientes en la compra."
            : "Hace falta al menos saber qué se come, y no pasa nada."}
        </p>
      </div>

      {hayComida ? (
        <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm">
          {lineas.map((linea) => (
            <div key={linea.etiqueta} className="flex gap-2">
              <dt className="w-28 shrink-0 text-xs text-muted-foreground">{linea.etiqueta}</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-line text-pretty">{linea.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* El icono vive aquí y no entre las preguntas, igual que en sueño: es lo
          que hace que reconozcas una comida en la rejilla sin leerla, pero
          nadie abandona por no tenerlo, y una pregunta más sí hace abandonar. */}
      {hayComida ? <IconoDeLaComida valor={icono} onGuardar={onIcono} /> : null}

      {editando ? null : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onOtra}>
            Apuntar otra comida
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * El icono, guardado al tocarlo.
 *
 * `IconPicker` nació para un formulario y manda su valor en un input oculto;
 * aquí no hay formulario que enviar, así que se mira lo que escribe en ese
 * input y se guarda solo. Envolverlo es preferible a duplicar la rejilla de
 * emoji, que es lo que hace falta tener en un solo sitio.
 */
function IconoDeLaComida({ valor, onGuardar }: { valor: string; onGuardar: (valor: string) => void }) {
  return (
    <div
      className="flex flex-col gap-2 border-t border-border pt-3"
      onChangeCapture={(event) => {
        const destino = event.target as HTMLInputElement;
        if (destino.name !== "icon") return;
        if (destino.value === valor) return;
        onGuardar(destino.value);
      }}
    >
      <IconPicker name="icon" defaultValue={valor || null} label="Un icono para esta comida" />
    </div>
  );
}

/** Lo que ya hay escrito, o el hueco desde el que se entra. */
function respuestasIniciales(
  meal: MealRow | undefined,
  date: string,
  defaultType: MealType,
): Respuestas {
  return {
    // El tipo y el día vienen puestos del hueco de la rejilla, que es de donde
    // se entra casi siempre. Así la encuesta abre en «¿qué se come?».
    meal_type: meal?.meal_type ?? defaultType,
    meal_date: meal?.meal_date ?? date,
    name: meal?.name ?? "",
    ingredients: (meal?.ingredients ?? [])
      .map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" "))
      .join("\n"),
    cook: meal?.cook ?? "",
    notes: meal?.notes ?? "",
  };
}
