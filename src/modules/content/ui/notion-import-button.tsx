"use client";

import { Download, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { importFromNotion } from "@/modules/content/actions";
import type { ImportResult } from "@/modules/content/notion-import";

/**
 * Traer el calendario desde Notion.
 *
 * A mano y no por cron: la importación es de sentido único y pisa lo que
 * haya, así que si una automática cambiara el estado de una pieza mientras
 * alguien mira el tablero, la aplicación parecería embrujada. Se pulsa cuando
 * se quiere.
 *
 * El resultado se queda en pantalla en vez de irse con el aviso, porque lo
 * que importa de una importación no es que terminó sino qué no entendió:
 * un estado nuevo en Notion sale aquí y en ningún otro sitio.
 */
export function NotionImportButton({ configured }: { configured: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Para traer el calendario desde Notion falta configurar{" "}
        <code className="rounded bg-secondary px-1 py-0.5 text-xs">NOTION_CONTENT_DATABASE_ID</code>{" "}
        en las variables de entorno del servidor, y compartir esa base con la integración.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const outcome = await importFromNotion();
              setResult(outcome);
              if (outcome.error) toast.error(outcome.error);
              else
                toast.success(
                  `${outcome.imported} nuevas, ${outcome.updated} actualizadas.`,
                );
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Download />}
          Traer desde Notion
        </Button>
      </div>

      {result && !result.error ? (
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{result.imported}</span>{" "}
            nuevas ·{" "}
            <span className="font-medium tabular-nums text-foreground">{result.updated}</span>{" "}
            actualizadas
            {result.skipped > 0 ? ` · ${result.skipped} filas sin título, saltadas` : ""}
          </p>

          {result.warnings.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
              <p className="text-xs font-medium">Lo que no entendí</p>
              <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="pt-1 text-xs text-muted-foreground">
                Son opciones nuevas en Notion. Se han dejado fuera en lugar de guardarse: guardarlas
                daría la falsa impresión de que la aplicación las usa.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
