import { colorForName } from "@/core/notion-colors";
import type { MemberSide, PersonCircle, ProjectColor } from "@/types/database";

/**
 * Las personas de tus proyectos, en su forma pura.
 *
 * Viven en el núcleo y no en el módulo de tareas porque las usarán varios
 * módulos (los recordatorios, el día). Nada de aquí sabe de proyectos: sólo
 * cómo se escribe, se reconoce y se pinta una persona.
 *
 * Nunca hay foto: nada sube de WhatsApp. Un círculo con sus iniciales y un
 * color sacado de su id, que es el mismo en todas las pantallas sin guardarlo.
 */

export const CIRCLES: readonly PersonCircle[] = [
  "FAMILIA",
  "AMIGOS",
  "TRABAJO",
  "CLIENTES",
  "SERVICIOS",
  "OTROS",
];

export const CIRCLE_LABELS: Record<PersonCircle, string> = {
  FAMILIA: "Familia",
  AMIGOS: "Amigos",
  TRABAJO: "Trabajo",
  CLIENTES: "Clientes",
  SERVICIOS: "Servicios",
  OTROS: "Otros",
};

export const SIDES: readonly MemberSide[] = ["NOSOTROS", "CONTRAPARTE", "ASESOR", "OTRO"];

export const SIDE_LABELS: Record<MemberSide, string> = {
  NOSOTROS: "Nuestro lado",
  CONTRAPARTE: "La otra parte",
  ASESOR: "Asesor",
  OTRO: "Otro",
};

/** Los topes de la base, para que el formulario diga lo mismo que ella. */
export const PERSON_NAME_MAX = 80;
export const PERSON_NOTE_MAX = 1000;
export const PERSON_RELATION_MAX = 120;

/**
 * Un nombre sin tildes, sin mayúsculas, sin signos y con un solo espacio.
 *
 * Es lo que se compara al casar «lucia» con «Lucía», o «Tía Inés» con «tia
 * ines». No se usa para enseñar nada.
 */
export function normalizeName(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «Lucía Martín» → «LM»; «Tomás» → «TO»; la fila «Yo» → «Yo». */
export function initials(name: string, isOwner = false): string {
  if (isOwner) return "Yo";
  const palabras = name
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toLocaleUpperCase("es");
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toLocaleUpperCase("es");
}

/** El color de una persona: el suyo si lo eligió, si no uno fijo sacado de su id. */
export function personColor(person: { id: string; color?: ProjectColor | null }): ProjectColor {
  return person.color && person.color !== "default" ? person.color : colorForName(person.id);
}

/**
 * Un nombre que cabe en un botón: las dos primeras palabras («María Fernanda
 * de los Ángeles Castellanos» → «María Fernanda»), cortado a 24 caracteres.
 */
export function shortName(name: string): string {
  const dos = name.trim().split(/\s+/).slice(0, 2).join(" ");
  return dos.length > 24 ? `${dos.slice(0, 23).trimEnd()}…` : dos;
}

/** Cómo se llama en una lista: tú eres «Tú», no «Yo». */
export function displayName(person: { name: string; is_owner?: boolean }): string {
  return person.is_owner ? "Tú" : person.name;
}

export interface PersonForMatch {
  id: string;
  name: string;
  aliases: string[];
  is_owner?: boolean;
  archived_at?: string | null;
}

/** ¿Es «yo»? Lo que se escribe en un archivo para hablar de ti. */
export function isMe(texto: string): boolean {
  const n = normalizeName(texto);
  return n === "yo" || n === "tu" || n === "mi" || n === "yo mismo";
}

/**
 * Las personas que se llaman así, por nombre o por alias.
 *
 * Devuelve todas las que encajan, no la primera: con dos «Ana» quien llama
 * tiene que decidir, y adivinar casaría a la persona equivocada sin avisar.
 * Las archivadas van detrás.
 */
export function findPeopleByName<T extends PersonForMatch>(texto: string, people: T[]): T[] {
  const buscado = normalizeName(texto);
  if (buscado === "") return [];
  if (isMe(texto)) return people.filter((p) => p.is_owner);
  return people
    .filter((p) => !p.is_owner)
    .filter((p) => normalizeName(p.name) === buscado || p.aliases.some((a) => normalizeName(a) === buscado))
    .sort((a, b) => Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)));
}

/** Sólo las cuatro últimas cifras, o nada. El teléfono entero nunca se guarda. */
export function phoneTail(texto: string | null | undefined): string | null {
  const cifras = (texto ?? "").replace(/\D/g, "");
  return cifras.length >= 4 ? cifras.slice(-4) : null;
}
