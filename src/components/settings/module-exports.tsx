import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Sacar cada módulo a CSV.
 *
 * Trading podía exportarse desde el primer día y los siete de vida no podían de
 * ninguna forma: meses de sueño, hábitos y tareas encerrados aquí dentro. Una
 * aplicación privada que no deja sacar tus propios datos es una que te tiene,
 * no una que te sirve.
 *
 * Son enlaces normales con `download` y no un `fetch` a un blob: la ruta ya
 * pone `Content-Disposition`, así que el navegador escribe el archivo en disco
 * sin tener que sostenerlo entero en memoria primero.
 */
const MODULOS: { slug: string; label: string }[] = [
  { slug: "sueno", label: "Sueño" },
  { slug: "habitos", label: "Hábitos" },
  { slug: "tareas", label: "Tareas" },
  { slug: "comidas", label: "Comidas" },
  { slug: "lecturas", label: "Lecturas" },
  { slug: "contenido", label: "Contenido" },
];

export function ModuleExports() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sacar un módulo a CSV</CardTitle>
        <CardDescription>
          Todo lo que tienes registrado en cada módulo, en un archivo que abre cualquier hoja de
          cálculo. Las operaciones tienen su propia exportación, con filtros, desde la tabla de
          Operaciones.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {MODULOS.map((modulo) => (
          <Button key={modulo.slug} variant="outline" size="sm" asChild>
            <a href={`/api/export/${modulo.slug}`} download>
              <Download className="size-4" aria-hidden />
              {modulo.label}
            </a>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
