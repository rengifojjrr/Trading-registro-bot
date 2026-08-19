"use client";

import { RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";

import { aparienciaDeFabrica, aplicarApariencia } from "@/lib/appearance/apply";
import {
  CORNER_OPTIONS,
  DENSITY_OPTIONS,
  PALETTE_OPTIONS,
  SURFACE_OPTIONS,
  THEME_OPTIONS,
  type Appearance,
  type Option,
} from "@/lib/appearance/catalog";
import { cn } from "@/lib/utils";

/**
 * El panel de apariencia.
 *
 * Dos cosas que parecen detalles y no lo son:
 *
 * **No hay botón de «Guardar».** El cambio se ve al pulsar. Es la única
 * forma de elegir con criterio: nadie puede juzgar «Bisel» leyendo la
 * palabra «Bisel».
 *
 * **Cada opción se enseña pintada con su propio aspecto.** Las paletas
 * llevan sus tiras de color, las superficies una tarjeta de muestra dibujada
 * con esa superficie, las esquinas su radio y las densidades su hueco. Y
 * todas esas muestras salen de las mismas reglas CSS que la aplicación de
 * verdad -- no de una copia en este archivo -- porque un botón que promete
 * una cosa y enseña otra es peor que no enseñar nada.
 *
 * La apariencia llega como prop desde el servidor en vez de leerse del DOM
 * al montar: leerla después obligaría a renderizar primero con un valor
 * inventado y corregirlo, que es un parpadeo dentro del propio panel.
 */
export function AppearancePanel({
  appearance,
  compact = false,
}: {
  appearance: Appearance;
  /** Sin las frases largas, para cuando va dentro de una ventana pequeña. */
  compact?: boolean;
}) {
  const [actual, setActual] = useState(appearance);
  const [reseteado, setReseteado] = useState<Appearance | null>(null);

  function cambiar(cambios: Partial<Appearance>) {
    setActual(aplicarApariencia(cambios));
    setReseteado(null);
  }

  return (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-6")}>
      <Eje
        titulo="Paleta"
        descripcion="Los colores de todo, menos los que significan algo."
        compact={compact}
      >
        {PALETTE_OPTIONS.map((option) => (
          <Opcion
            key={option.value}
            option={option}
            pressed={actual.palette === option.value}
            onClick={() => cambiar({ palette: option.value })}
            compact={compact}
          >
            <span
              data-muestra-paleta={option.value}
              className="flex h-6 w-full overflow-hidden rounded-full border border-border"
              aria-hidden
            >
              <span className="flex-1 bg-[var(--muestra-1)]" />
              <span className="flex-1 bg-[var(--muestra-2)]" />
              <span className="flex-1 bg-[var(--muestra-3)]" />
            </span>
          </Opcion>
        ))}
      </Eje>

      <Eje
        titulo="Claro u oscuro"
        descripcion="«Automático» hace lo que diga tu sistema."
        compact={compact}
      >
        {THEME_OPTIONS.map((option) => (
          <Opcion
            key={option.value}
            option={option}
            pressed={actual.theme === option.value}
            onClick={() => cambiar({ theme: option.value })}
            compact={compact}
          >
            <span
              className="flex h-6 w-full overflow-hidden rounded-full border border-border"
              aria-hidden
            >
              {option.value !== "oscuro" ? <MitadDia /> : null}
              {option.value !== "claro" ? <MitadNoche /> : null}
            </span>
          </Opcion>
        ))}
      </Eje>

      <Eje
        titulo="Superficie"
        descripcion="Cómo se dibujan las tarjetas."
        compact={compact}
      >
        {SURFACE_OPTIONS.map((option) => (
          <Opcion
            key={option.value}
            option={option}
            pressed={actual.surface === option.value}
            onClick={() => cambiar({ surface: option.value })}
            compact={compact}
          >
            {/* La muestra va sobre un fondo distinto del de la tarjeta que
                la contiene. Sin eso no se distingue nada: «Marco» quita el
                relleno y «Vidrio» difumina lo de detrás, y las dos cosas
                sólo se ven si detrás hay algo. */}
            <span className="relative flex h-10 items-stretch overflow-hidden rounded-md bg-muted p-1.5" aria-hidden>
              {/* Dos manchas de color detrás. Sin algo que difuminar,
                  «Vidrio» se ve idéntico a «Plano»: el difuminado no tiene
                  aspecto propio, tiene el de lo que hay debajo. */}
              <span className="absolute -top-2 left-3 size-7 rounded-full bg-primary/70" />
              <span className="absolute -bottom-3 right-4 size-8 rounded-full bg-muted-foreground/50" />
              <span
                data-muestra-superficie={option.value}
                className="relative w-full rounded-md border border-border bg-card shadow-sm"
              />
            </span>
          </Opcion>
        ))}
      </Eje>

      <Eje titulo="Esquinas" descripcion="El radio de todo lo que tiene borde." compact={compact}>
        {CORNER_OPTIONS.map((option) => (
          <Opcion
            key={option.value}
            option={option}
            pressed={actual.corners === option.value}
            onClick={() => cambiar({ corners: option.value })}
            compact={compact}
          >
            <span
              data-muestra-esquinas={option.value}
              className="block h-6 w-full border border-border bg-muted"
              aria-hidden
            />
          </Opcion>
        ))}
      </Eje>

      <Eje titulo="Densidad" descripcion="El aire entre bloques." compact={compact}>
        {DENSITY_OPTIONS.map((option) => (
          <Opcion
            key={option.value}
            option={option}
            pressed={actual.density === option.value}
            onClick={() => cambiar({ density: option.value })}
            compact={compact}
          >
            <span
              data-muestra-densidad={option.value}
              className="flex w-full flex-col justify-center"
              aria-hidden
            >
              <span className="h-1.5 rounded-xs bg-muted-foreground/45" />
              <span className="h-1.5 rounded-xs bg-muted-foreground/45" />
              <span className="h-1.5 rounded-xs bg-muted-foreground/45" />
            </span>
          </Opcion>
        ))}
      </Eje>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => {
            const fabrica = aparienciaDeFabrica();
            setActual(fabrica);
            setReseteado(fabrica);
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Como viene de fábrica
        </button>

        <p aria-live="polite" className="text-xs text-muted-foreground">
          {reseteado ? `Ha quedado en ${describir(reseteado)}.` : "Se aplica al momento y sólo en este navegador."}
        </p>
      </div>
    </div>
  );
}

/** El fondo y la tinta de día de la paleta puesta, para la muestra del tema. */
function MitadDia() {
  return (
    <span className="flex flex-1 items-center justify-center bg-[var(--dia-fondo,var(--background))]">
      <span className="h-0.5 w-3 rounded-full bg-[var(--dia-tinta,var(--foreground))]" />
    </span>
  );
}

function MitadNoche() {
  return (
    <span className="flex flex-1 items-center justify-center bg-[var(--noche-fondo,var(--background))]">
      <span className="h-0.5 w-3 rounded-full bg-[var(--noche-tinta,var(--foreground))]" />
    </span>
  );
}

function Eje({
  titulo,
  descripcion,
  compact,
  children,
}: {
  titulo: string;
  descripcion: string;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">{titulo}</legend>
      {compact ? null : <p className="text-xs text-muted-foreground">{descripcion}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </fieldset>
  );
}

/**
 * `aria-pressed` y no sólo un color: quien navega con lector de pantalla
 * necesita que le digan cuál está puesta, y quien no distingue el azul del
 * borde activo también.
 */
function Opcion<T extends string>({
  option,
  pressed,
  onClick,
  compact,
  children,
}: {
  option: Option<T>;
  pressed: boolean;
  onClick: () => void;
  compact: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={option.hint}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        pressed ? "border-primary bg-accent" : "border-border hover:bg-accent/50",
      )}
    >
      {children}
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">{option.label}</span>
          {option.cost === "pesado" ? (
            // La etiqueta honesta de coste: difuminar el fondo obliga al
            // navegador a recomponer lo que hay detrás de cada tarjeta, y con
            // una tabla de cientos de filas se nota al desplazar. Quien elige
            // tiene derecho a saberlo antes, no a descubrirlo.
            <span
              className="rounded-full bg-warning/15 px-1.5 text-[10px] font-medium text-warning"
              title="Difumina o desenfoca: en un equipo modesto se nota al desplazar."
            >
              pesado
            </span>
          ) : null}
        </span>
        {compact ? null : (
          <span className="text-[11px] leading-snug text-muted-foreground">{option.hint}</span>
        )}
      </span>
    </button>
  );
}

function describir(appearance: Appearance): string {
  const nombre = <T extends string>(options: Option<T>[], value: T) =>
    options.find((o) => o.value === value)?.label.toLowerCase() ?? value;

  return [
    nombre(PALETTE_OPTIONS, appearance.palette),
    nombre(THEME_OPTIONS, appearance.theme),
    nombre(SURFACE_OPTIONS, appearance.surface),
    `esquinas ${nombre(CORNER_OPTIONS, appearance.corners)}`,
    `densidad ${nombre(DENSITY_OPTIONS, appearance.density)}`,
  ].join(", ");
}
