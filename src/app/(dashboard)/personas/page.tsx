import { PageHeader } from "@/components/layout/page-header";
import { fetchPeopleList } from "@/modules/tasks/project-queries";
import { PeopleList } from "@/modules/tasks/ui/projects/people-list";

/**
 * Personas: la gente de tus proyectos.
 *
 * Sólo quien metiste en algo tuyo. La ficha larga que arma el bot de cada uno
 * (la de siete secciones) no está aquí: vive en tu Mac.
 */
export default async function PeoplePage() {
  const { people } = await fetchPeopleList();
  return (
    <>
      <PageHeader title="Personas" description="Quién está en tus proyectos y qué le toca." />
      <PeopleList people={people} />
    </>
  );
}
