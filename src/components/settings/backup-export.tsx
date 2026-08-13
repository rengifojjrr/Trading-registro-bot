"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Full-data download. A plain link rather than a fetch + blob: the route
 * already sets Content-Disposition, so the browser streams the file
 * straight to disk without holding the whole export in memory first.
 */
export function BackupExport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Respaldo de tus datos</CardTitle>
        <CardDescription>
          Descarga todo en un archivo JSON: operaciones, fills originales de Coinbase, diario, comentarios,
          estrategias, etiquetas y dibujos. Las capturas se listan por su ruta, sin incluir la imagen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" asChild>
          <a href="/api/export/backup" download>
            <Download className="size-4" aria-hidden />
            Descargar respaldo
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
