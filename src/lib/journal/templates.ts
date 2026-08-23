/**
 * Guiones para escribir el diario, porque el problema no es escribir: es
 * empezar.
 *
 * Un recuadro vacío que pone «Notas» recibe «bien» o «mal», o nada. Las mismas
 * preguntas escritas encima reciben párrafos, y son las preguntas las que
 * hacen que un diario sirva de algo dentro de seis meses: «me salió bien» no
 * se puede releer, «entré porque venía de rechazar el máximo del día anterior»
 * sí.
 *
 * Son preguntas, no huecos que rellenar. Una plantilla que pide datos --
 * precio, tamaño, hora -- duplica lo que la aplicación ya calcula sola y encima
 * mal escrito a mano.
 */

export interface JournalTemplate {
  id: string;
  label: string;
  /** De una línea, para que se elija sin abrir nada. */
  hint: string;
  body: string;
}

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  {
    id: "plan",
    label: "Qué vi y qué esperaba",
    hint: "Para apuntar la tesis antes de que se te olvide por qué entraste",
    body: [
      "Qué vi para entrar:",
      "",
      "Qué esperaba que pasara:",
      "",
      "Qué habría hecho que no entrara:",
      "",
    ].join("\n"),
  },
  {
    id: "revision",
    label: "Revisión después de cerrar",
    hint: "Separa si la decisión fue buena de si el resultado lo fue",
    body: [
      // Las dos preguntas separadas a propósito: una decisión buena puede
      // perder dinero y una mala puede ganarlo, y confundirlas es la forma más
      // rápida de aprender exactamente lo contrario de lo que pasó.
      "¿La decisión fue buena, independientemente del resultado?",
      "",
      "¿El resultado fue bueno?",
      "",
      "Si volviera a ver lo mismo, ¿haría lo mismo?",
      "",
    ].join("\n"),
  },
  {
    id: "error",
    label: "Se torció",
    hint: "Para cuando hubo un error y quieres que no se repita",
    body: [
      "Qué hice distinto de lo que tenía planeado:",
      "",
      "En qué momento exacto se torció:",
      "",
      "Qué estaba sintiendo justo antes:",
      "",
      "Qué señal, concreta y visible, me habría avisado:",
      "",
    ].join("\n"),
  },
  {
    id: "salida",
    label: "Por qué salí cuando salí",
    hint: "La parte que más se olvida y más dinero mueve",
    body: [
      "Por qué cerré en ese momento:",
      "",
      "¿Estaba en el plan o lo decidí sobre la marcha?",
      "",
      "Qué habría pasado si aguanto:",
      "",
    ].join("\n"),
  },
];

export function findTemplate(id: string): JournalTemplate | undefined {
  return JOURNAL_TEMPLATES.find((t) => t.id === id);
}

/**
 * La plantilla metida en lo que ya hay escrito.
 *
 * Nunca sobrescribe: si ya escribiste algo, la plantilla va detrás separada por
 * una línea en blanco. Un botón que borra un párrafo que acabas de escribir es
 * un botón que no se vuelve a tocar.
 */
export function applyTemplate(current: string, template: JournalTemplate): string {
  const escrito = current.trim();
  if (escrito === "") return template.body;
  return `${escrito}\n\n${template.body}`;
}
