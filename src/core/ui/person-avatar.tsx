import { colorVars } from "@/core/notion-colors";
import { displayName, initials, personColor } from "@/core/people";
import { cn } from "@/lib/utils";
import type { ProjectColor } from "@/types/database";

/**
 * El círculo de una persona: sus iniciales y un color sacado de su id.
 *
 * Nunca una foto: nada sube de WhatsApp. Quien no tiene WhatsApp (o no se
 * sabe que lo tenga) lleva el borde punteado; es la única marca, y además va
 * en el texto que lee un lector de pantalla.
 */
export function PersonAvatar({
  person,
  size = "md",
  className,
}: {
  person: {
    id: string;
    name: string;
    is_owner?: boolean;
    color?: ProjectColor | null;
    has_whatsapp?: boolean;
    whatsapp_hint?: "SI" | "NO" | null;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sinWhatsapp = !person.is_owner && !person.has_whatsapp && person.whatsapp_hint !== "SI";
  const nombre = displayName(person);
  return (
    <span
      title={nombre}
      aria-label={sinWhatsapp ? `${nombre}, sin WhatsApp` : nombre}
      role="img"
      style={{
        ...colorVars(personColor(person)),
        color: "var(--tag-color)",
        // Opaco (mezclado con el fondo de la tarjeta, no con «transparent»): en
        // una pila de círculos el de debajo no puede asomar por el de encima, o
        // «Yo» se leía «Yc» y «TO» se leía «TC».
        backgroundColor: "color-mix(in srgb, var(--tag-color) 14%, var(--card))",
        borderColor: "var(--tag-color)",
      }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full border font-semibold",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-7 text-[11px]",
        size === "lg" && "size-12 text-base",
        sinWhatsapp ? "border-dashed" : "border-transparent",
        className,
      )}
    >
      {initials(person.name, person.is_owner)}
    </span>
  );
}

/** Hasta `max` círculos y «+n». */
export function PeopleStack({
  people,
  max = 3,
}: {
  people: Parameters<typeof PersonAvatar>[0]["person"][];
  max?: number;
}) {
  if (people.length === 0) return null;
  const visibles = people.slice(0, max);
  const resto = people.length - visibles.length;
  return (
    <span className="flex items-center -space-x-1">
      {visibles.map((p) => (
        <PersonAvatar key={p.id} person={p} size="sm" className="ring-2 ring-card" />
      ))}
      {resto > 0 ? <span className="pl-2.5 text-xs text-muted-foreground">+{resto}</span> : null}
    </span>
  );
}
