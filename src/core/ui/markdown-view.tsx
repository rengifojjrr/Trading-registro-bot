import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Markdown sencillo, pintado con elementos de React y nunca con HTML crudo.
 *
 * Lo justo para una ficha técnica: encabezados, párrafos, listas, tablas,
 * **negrita**, *cursiva*, `código` y enlaces http(s). Nada de HTML incrustado:
 * el texto lo puede haber escrito Claude a partir de documentos de terceros,
 * así que se trata siempre como texto. Un enlace que no sea http(s) se pinta
 * como texto, no como enlace.
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return <div className={cn("flex flex-col gap-3 text-sm leading-relaxed", className)}>{bloques(source)}</div>;
}

function bloques(source: string): ReactNode[] {
  const lineas = source.replace(/\r\n?/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lineas.length) {
    const linea = lineas[i];
    if (linea.trim() === "") {
      i += 1;
      continue;
    }

    const h = linea.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const nivel = h[1].length;
      out.push(
        <p
          key={k++}
          role="heading"
          aria-level={Math.min(6, nivel + 2)}
          className={cn("font-semibold text-foreground", nivel <= 3 ? "text-base" : "text-sm")}
        >
          {enLinea(h[2])}
        </p>,
      );
      i += 1;
      continue;
    }

    if (linea.trim().startsWith("|")) {
      const filas: string[] = [];
      while (i < lineas.length && lineas[i].trim().startsWith("|")) {
        filas.push(lineas[i]);
        i += 1;
      }
      out.push(<Tabla key={k++} filas={filas} />);
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(linea)) {
      const items: string[] = [];
      const ordenada = /^\s*\d+[.)]\s+/.test(linea);
      while (i < lineas.length && /^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) {
        items.push(lineas[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
        i += 1;
      }
      const Lista = ordenada ? "ol" : "ul";
      out.push(
        <Lista key={k++} className={cn("flex flex-col gap-1 pl-5", ordenada ? "list-decimal" : "list-disc")}>
          {items.map((t, j) => (
            <li key={j}>{enLinea(t.replace(/^\[[ xX~]\]\s*/, ""))}</li>
          ))}
        </Lista>,
      );
      continue;
    }

    const parrafo: string[] = [];
    while (
      i < lineas.length &&
      lineas[i].trim() !== "" &&
      !/^(#{1,6})\s/.test(lineas[i]) &&
      !lineas[i].trim().startsWith("|") &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])
    ) {
      parrafo.push(lineas[i].trim());
      i += 1;
    }
    out.push(
      <p key={k++} className="text-foreground/90">
        {enLinea(parrafo.join(" "))}
      </p>,
    );
  }
  return out;
}

function celdas(fila: string): string[] {
  return fila.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function Tabla({ filas }: { filas: string[] }) {
  const separador = (f: string) => /^\|?\s*:?-{2,}/.test(f.trim());
  const cabecera = filas.length > 1 && separador(filas[1]) ? celdas(filas[0]) : null;
  const cuerpo = filas.filter((f, i) => !separador(f) && !(cabecera && i === 0)).map(celdas);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        {cabecera ? (
          <thead>
            <tr>
              {cabecera.map((c, i) => (
                <th key={i} className="border-b border-border px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {enLinea(c)}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {cuerpo.map((fila, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {fila.map((c, j) => (
                <td key={j} className="px-2 py-1.5 align-top">
                  {enLinea(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Negrita, cursiva, código y enlaces, sin HTML. */
function enLinea(texto: string): ReactNode[] {
  const out: ReactNode[] = [];
  const patron = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|https?:\/\/[^\s)]+)/g;
  let ultimo = 0;
  let k = 0;
  for (const m of texto.matchAll(patron)) {
    const i = m.index ?? 0;
    if (i > ultimo) out.push(texto.slice(ultimo, i));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k++} className="rounded bg-secondary px-1 text-xs">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, etiqueta, url] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      out.push(
        /^https?:\/\//i.test(url ?? "") ? (
          <a key={k++} href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {etiqueta}
          </a>
        ) : (
          etiqueta ?? t
        ),
      );
    } else if (t.startsWith("http")) {
      out.push(
        <a key={k++} href={t} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
          {t}
        </a>,
      );
    } else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    ultimo = i + t.length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}
