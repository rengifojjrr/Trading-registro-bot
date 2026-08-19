"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * El mismo resultado que devuelven las seis importaciones.
 *
 * Se declara aquí y no se importa de `@/lib/notion` porque este componente lo
 * usan los seis módulos, y ninguno debe arrastrar a los otros.
 */
export interface NotionImportOutcome {
  imported: number;
  updated: number;
  skipped: number;
  warnings: string[];
  notes: string[];
  error: string | null;
}

/**
 * Traer datos desde Notion, con su informe.
 *
 * Un solo componente para los seis módulos porque la operación es idéntica en
 * todos y lo único que cambia es qué se trae.
 *
 * El informe se queda en pantalla en lugar de irse con el aviso, porque lo que
 * importa de una importación no es que terminó sino qué *no* entendió: una
 * opción nueva en Notion sale aquí y en ningún otro sitio. Y las notas están
 * separadas de los avisos a propósito -- «las páginas leídas no vienen» no es
 * un fallo que arreglar, es algo que hay que saber.
 */
export function NotionImportCard({
  title,
  description,
  configured,
  missingVariable,
  onImport,
  label = "Traer desde Notion",
}: {
  title: string;
  description: string;
  configured: boolean;
  /** Qué variable de entorno falta, para poder decirlo con nombre y apellido. */
  missingVariable: string;
  onImport: () => Promise<NotionImportOutcome>;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<NotionImportOutcome | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {configured ? (
          <>
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const outcome = await onImport();
                    setResult(outcome);
                    if (outcome.error) toast.error(outcome.error);
                    else toast.success(`${outcome.imported} nuevas, ${outcome.updated} actualizadas.`);
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Download />}
                {label}
              </Button>
            </div>

            {result && !result.error ? <Report result={result} /> : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Falta configurar{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">{missingVariable}</code> en las
            variables de entorno del servidor, y compartir esa base con la integración de Notion.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Report({ result }: { result: NotionImportOutcome }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        <Count value={result.imported} /> nuevas · <Count value={result.updated} /> actualizadas
        {result.skipped > 0 ? ` · ${result.skipped} filas incompletas, saltadas` : ""}
      </p>

      {result.notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}

      {result.warnings.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
          <p className="text-xs font-medium">Lo que no entendí</p>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <p className="pt-1 text-xs text-muted-foreground">
            Se han dejado fuera en lugar de guardarse: guardarlas daría la falsa impresión de que la
            aplicación las usa.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <span className="font-medium tabular-nums text-foreground">{value}</span>;
}
