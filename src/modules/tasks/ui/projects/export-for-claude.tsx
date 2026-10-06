"use client";

import { Copy, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { exportProjectForClaude } from "@/modules/tasks/project-actions";

/**
 * «Exportar para Claude»: el proyecto como archivo, listo para la siguiente
 * vuelta.
 *
 * Lleva un id en cada línea. Claude lo cambia, se vuelve a importar y cada
 * línea sabe qué fila es: cambia en vez de duplicar. Se copia o se descarga;
 * en la Mac, su sitio es `data/proyectos/` del agente.
 */
export function ExportDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [estado, setEstado] = useState<{ nombre: string; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    exportProjectForClaude(projectId).then((r) => {
      if (!vivo) return;
      if (r.error) setError(r.error);
      else setEstado({ nombre: r.nombre, texto: r.texto });
    });
    return () => {
      vivo = false;
    };
  }, [open, projectId]);

  const copiar = async () => {
    if (!estado) return;
    try {
      await navigator.clipboard.writeText(estado.texto);
      toast.success("Copiado. Pégaselo a Claude.");
    } catch {
      toast.error("No pude copiarlo. Descárgalo.");
    }
  };

  const descargar = () => {
    if (!estado) return;
    const url = URL.createObjectURL(new Blob([estado.texto], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = estado.nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-full gap-3 p-4 sm:max-w-lg">
        <SheetTitle>Exportar para Claude</SheetTitle>
        <p className="text-sm text-muted-foreground">
          Pásale esto a Claude en la Mac. Cada línea lleva su id: al volver a importarlo, cambia lo que
          haya cambiado y no duplica nada.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        ) : estado === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Preparándolo…
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Button type="button" onClick={copiar} className="min-h-11">
                <Copy aria-hidden /> Copiar
              </Button>
              <Button type="button" variant="outline" onClick={descargar} className="min-h-11">
                <Download aria-hidden /> {estado.nombre}
              </Button>
            </div>
            <textarea
              readOnly
              value={estado.texto}
              aria-label="El archivo del proyecto"
              className="min-h-0 flex-1 resize-none rounded-md border border-input bg-transparent p-3 font-mono text-xs"
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
