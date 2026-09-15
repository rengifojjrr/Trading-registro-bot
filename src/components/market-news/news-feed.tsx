import { ArrowUpRight, Newspaper } from "lucide-react";

import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSignedPct } from "@/lib/economic-calendar/market-reaction";
import type { NewsItem } from "@/lib/market-news/queries";
import { estaMarcado, GRADO_LABELS, gradoDeMovimiento } from "@/lib/market-news/relevancia";
import { temaLabel } from "@/lib/market-news/temas";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Lo que ha pasado y no estaba en ningún calendario.
 *
 * El calendario sabe de lo programado; esto es lo otro: una moción que fracasa
 * en el Senado, un hackeo, un ETF aprobado. El 15 de septiembre de 2026
 * Bitcoin cayó un 2,6 % mientras la aplicación no decía absolutamente nada,
 * porque nada de aquello tenía fecha previa.
 *
 * Lo que se marca es **lo que movió el precio**, medido sobre velas de un
 * minuto, no lo que parece importante por su titular. Es la diferencia entre
 * un hecho y una opinión, y la pantalla dice cuál de las dos cosas es.
 */
export function NewsFeed({
  items,
  timezone,
  titulo = "Lo que ha pasado",
  descripcion = "Titulares que no están en ningún calendario. Se marca lo que movió el precio de verdad, no lo que suena importante.",
}: {
  items: NewsItem[];
  timezone: string;
  titulo?: string;
  descripcion?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="size-4 text-muted-foreground" aria-hidden />
          {titulo}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>

      <CardContent>
        <ul className="flex flex-col">
          {items.map((item) => (
            <Fila key={item.id} item={item} timezone={timezone} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Fila({ item, timezone }: { item: NewsItem; timezone: string }) {
  const grado = gradoDeMovimiento(item.maxMovePct1h);
  const marcado = estaMarcado(grado);
  const etiqueta = GRADO_LABELS[grado];

  return (
    <li className="border-b border-border last:border-0">
      {/* Enlace externo: el cuerpo entero está en la fuente y copiarlo aquí
          sería republicar lo que no es nuestro. Lo que sí es nuestro --
          cuándo salió y qué hizo el precio -- está en esta misma fila. */}
      <a
        href={item.url ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="-mx-2 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/40"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                "text-sm leading-snug",
                marcado ? "font-medium text-foreground" : "text-foreground/90",
              )}
            >
              {item.title}
            </span>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </span>

          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDateTime(item.publishedAt, timezone)}</span>
            {item.provider ? <span>· {item.provider}</span> : null}
            {item.topics.map((tema) => {
              const label = temaLabel(tema);
              return label ? (
                <span key={tema} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                  {label}
                </span>
              ) : null;
            })}
          </span>
        </span>

        <Movimiento item={item} grado={grado} etiqueta={etiqueta} />
      </a>
    </li>
  );
}

function Movimiento({
  item,
  grado,
  etiqueta,
}: {
  item: NewsItem;
  grado: ReturnType<typeof gradoDeMovimiento>;
  etiqueta: string | null;
}) {
  if (grado === "SIN_MEDIR") {
    return (
      <span className="shrink-0 text-xs text-muted-foreground">
        sin medir
        <InfoHint label="Sin medir">
          La reacción se mide una hora después de publicarse. Hasta entonces no hay cifra, que no es
          lo mismo que que no se moviera.
        </InfoHint>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-baseline gap-2 text-xs tabular-nums">
      {etiqueta ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            grado === "MOVIO_MUCHO" ? "bg-warning/20 text-warning" : "bg-warning/10 text-warning",
          )}
        >
          {etiqueta}
        </span>
      ) : null}

      <span className="text-muted-foreground">
        en 1 h{" "}
        <span
          className={cn(
            "font-medium",
            (item.movePct1h ?? 0) > 0 && "text-positive",
            (item.movePct1h ?? 0) < 0 && "text-negative",
          )}
        >
          {formatSignedPct(item.movePct1h)}
        </span>
      </span>
    </span>
  );
}
