import { PageHeader } from "@/components/layout/page-header";
import { ImportFromClaude } from "@/modules/tasks/ui/projects/import-from-claude";

/**
 * Importar un proyecto desde el archivo que escribe Claude en la Mac.
 *
 * El lector corre en el navegador y el plan se enseña antes de tocar nada.
 * Importar nunca borra y nunca pisa lo que escribiste tú en la app.
 */
export default function ImportProjectPage() {
  return (
    <>
      <PageHeader
        title="Importar desde Claude"
        description="La ficha, la gente, la hoja de ruta y las tareas de un proyecto, de una vez."
      />
      <ImportFromClaude />
    </>
  );
}
