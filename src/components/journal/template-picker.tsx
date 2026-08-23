"use client";

import { Button } from "@/components/ui/button";
import { applyTemplate, JOURNAL_TEMPLATES } from "@/lib/journal/templates";

/**
 * Botones que meten un guion de preguntas en el recuadro de notas.
 *
 * El problema del diario nunca fue escribir: fue empezar. Un recuadro vacío
 * recibe «bien» o «mal»; las mismas preguntas escritas encima reciben párrafos.
 *
 * Nunca sobrescribe lo que ya hay -- lo añade debajo. Un botón que se come un
 * párrafo recién escrito no se vuelve a tocar.
 */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        ¿No sabes por dónde empezar? Elige un guion de preguntas:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {JOURNAL_TEMPLATES.map((template) => (
          <Button
            key={template.id}
            type="button"
            variant="outline"
            size="sm"
            title={template.hint}
            onClick={() => onChange(applyTemplate(value, template))}
          >
            {template.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
