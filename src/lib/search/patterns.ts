/**
 * Piezas puras del buscador: el patrón sin tildes que se manda a la base y el
 * subtítulo de una persona. Aparte de `query.ts` (que es de servidor) para
 * poder probarlas.
 */

/**
 * Las vocales como comodín de un carácter (`_`), sin tildes: «tomas» y «Tomás»
 * dan el mismo patrón, `t_m_s`. Sólo con cuatro letras o más; con menos, el
 * patrón sería casi todo comodín y traería media base.
 */
export function patronSinTildes(value: string): string {
  const sinTildes = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (sinTildes.replace(/[^\p{L}\p{N}]/gu, "").length < 4) return value;
  return sinTildes.replace(/[aeiouAEIOU]/g, "_");
}

/** «Arquitecta · Finca El Roble», «Socio · 2 proyectos», o «quién es». */
export function subtituloDePersona(relation: string | null, enProyectos: { role: string | null; project: string | null }[]): string {
  const conProyecto = enProyectos.filter((m) => m.project !== null);
  if (conProyecto.length === 1) {
    return [conProyecto[0].role ?? relation, conProyecto[0].project].filter(Boolean).join(" · ");
  }
  if (conProyecto.length > 1) {
    return [conProyecto[0].role ?? relation, `${conProyecto.length} proyectos`].filter(Boolean).join(" · ");
  }
  return relation ?? "Persona";
}

