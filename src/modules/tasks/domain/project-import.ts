import { idDerivado } from "@/core/ids";
import { colorForName } from "@/core/notion-colors";
import { findPeopleByName, normalizeName } from "@/core/people";
import type {
  AuthorKind,
  DuePrecision,
  FieldSrc,
  LogKind,
  MemberSide,
  MilestoneKind,
  MilestoneStatus,
  ProjectColor,
  ProjectStatus,
  SourceKind,
} from "@/types/database";

import type { ArchivoProyecto, HitoArchivo, PersonaArchivo, TareaArchivo } from "./project-file";
import { PROJECT_STATUS_LABELS, freeSlug, shortDate } from "./projects";
import type { TaskPriority, TaskStatus } from "./tasks";

/**
 * Qué hará la importación de un archivo de proyecto, antes de hacerlo.
 *
 * Es una función pura: recibe lo que entendió el lector y lo que ya hay en la
 * base, y devuelve el plan -- una lista de operaciones y las frases que se le
 * enseñan al dueño («Así lo entendí: crearé 5 tareas, 3 personas…»). Nada se
 * escribe hasta que él dice que sí, y entonces el servidor vuelve a calcular el
 * plan con la base de ese momento y sólo sigue si sale el mismo.
 *
 * Tres reglas que no se negocian:
 *
 * 1. **Nunca borra.** Lo que está en la aplicación y no en el archivo se queda.
 *    Una tarea marcada `[-]` tampoco se borra: se dice que para quitarla hay que
 *    hacerlo en la aplicación.
 * 2. **Nunca pisa lo tuyo.** Un campo cambia sólo si estaba vacío o si lo
 *    escribió Claude la vez anterior (`field_src = 'claude'`). Un campo sin
 *    marca que ya tiene valor cuenta como tuyo.
 * 3. **Terminar es definitivo.** Una tarea o un hito hechos no se reabren
 *    desde un archivo; sólo tú los reabres.
 */

// ---------------------------------------------------------- lo que ya hay

export interface ProyectoExistente {
  id: string;
  name: string;
  slug: string | null;
  aliases: string[];
  status: ProjectStatus;
  objective: string | null;
  how_md: string | null;
  how_by: AuthorKind | null;
  started_on: string | null;
  target_on: string | null;
  color: ProjectColor | null;
  icon: string | null;
  cloud_level: string;
  field_src: FieldSrc;
}

export interface PersonaExistente {
  id: string;
  name: string;
  aliases: string[];
  is_owner: boolean;
  archived_at: string | null;
  relation: string | null;
  note: string | null;
  whatsapp_hint: "SI" | "NO" | null;
  field_src: FieldSrc;
}

export interface MiembroExistente {
  id: string;
  person_id: string;
  role: string | null;
  does_md: string | null;
  side: MemberSide | null;
  field_src: FieldSrc;
}

export interface FrenteExistente {
  id: string;
  name: string;
  lead_person_id: string | null;
  field_src: FieldSrc;
}

export interface HitoExistente {
  id: string;
  kind: MilestoneKind;
  stage_id: string | null;
  title: string;
  starts_on: string | null;
  due_on: string | null;
  due_precision: DuePrecision;
  status: MilestoneStatus;
  owner_person_id: string | null;
  detail: string | null;
  field_src: FieldSrc;
}

export interface TareaExistente {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  priority: TaskPriority;
  assignee_id: string | null;
  stream_id: string | null;
  parent_id: string | null;
  notes: string | null;
  field_src: FieldSrc;
}

export interface EntradaExistente {
  id: string;
  at: string;
  title: string;
}

export interface EnlaceExistente {
  id: string;
  label: string;
  ref: string | null;
}

export interface FichaExistente {
  id: string;
  body_md: string;
  made_by: AuthorKind;
}

export interface EstadoParaImportar {
  /** Todos tus proyectos, para casar el archivo y no repetir nombre ni slug. */
  proyectos: { id: string; name: string; slug: string | null }[];
  /** El proyecto que casa con el archivo, si casa con alguno. */
  proyecto: ProyectoExistente | null;
  /** Todas tus personas: se casan por id, nombre y alias. */
  personas: PersonaExistente[];
  miembros: MiembroExistente[];
  frentes: FrenteExistente[];
  hitos: HitoExistente[];
  tareas: TareaExistente[];
  bitacora: EntradaExistente[];
  enlaces: EnlaceExistente[];
  ficha: FichaExistente | null;
}

/** Con qué proyecto casa el archivo: por id, por slug o por nombre. */
export function encontrarProyecto(
  archivo: Pick<ArchivoProyecto, "ref" | "slug" | "nombre">,
  proyectos: { id: string; name: string; slug: string | null }[],
): string | null {
  if (archivo.ref) {
    const porId = proyectos.find((p) => p.id === archivo.ref);
    if (porId) return porId.id;
  }
  if (archivo.slug) {
    const porSlug = proyectos.find((p) => p.slug === archivo.slug);
    if (porSlug) return porSlug.id;
  }
  const nombre = normalizeName(archivo.nombre);
  return proyectos.find((p) => normalizeName(p.name) === nombre)?.id ?? null;
}

// ------------------------------------------------------------- el plan

export type Tabla =
  | "core_people"
  | "tasks_projects"
  | "tasks_project_members"
  | "tasks_streams"
  | "tasks_milestones"
  | "tasks_items"
  | "tasks_project_log"
  | "tasks_project_sources"
  | "tasks_project_docs";

export type Op =
  | { tabla: Tabla; accion: "crear"; id: string; fila: Record<string, unknown> }
  | { tabla: Tabla; accion: "cambiar"; id: string; cambios: Record<string, unknown> };

export interface Plan {
  proyectoId: string;
  nombre: string;
  nuevo: boolean;
  /** Las operaciones, en el orden en que hay que hacerlas. */
  ops: Op[];
  /** «Así lo entendí»: lo que se enseña antes de crear. */
  lineas: string[];
  /** Lo que cambia en lo que ya existe. */
  cambios: string[];
  /** Lo que el archivo cambiaría pero se queda como tú lo pusiste. */
  seQueda: string[];
  /** Lo que no se borra aunque el archivo lo pida o no lo nombre. */
  noSeBorra: string[];
  avisos: string[];
  /** Si no se puede importar, por qué. */
  bloqueo: string | null;
  cuentas: {
    personasNuevas: number;
    personas: number;
    miembros: number;
    frentes: number;
    etapas: number;
    hitos: number;
    tareasNuevas: number;
    tareasHechas: number;
    tareasCambian: number;
    bitacora: number;
    enlaces: number;
    recordatorios: number;
  };
  /** Huella de las operaciones: si al aplicar no sale la misma, algo cambió. */
  huella: string;
}

export interface OpcionesPlan {
  /** Ahora, como instante ISO. */
  ahora: string;
  /** Hoy, en tu zona. `YYYY-MM-DD`. */
  hoy: string;
}

// ------------------------------------------------------------- ayudas

type Decision = "igual" | "poner" | "cambiar" | "tuyo";

function vacio(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function iguales(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  }
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return a === b;
}

/** La regla de los campos: vacío se pone, lo de Claude se cambia, lo tuyo se queda. */
function decidir(campo: string, actual: unknown, nuevo: unknown, src: FieldSrc): Decision {
  if (vacio(nuevo) || iguales(actual, nuevo)) return "igual";
  if (vacio(actual)) return "poner";
  return src[campo] === "claude" ? "cambiar" : "tuyo";
}

/** Una huella corta y estable (FNV-1a de 32 bits, dos pasadas). No es seguridad: es «¿salió lo mismo?». */
export function huellaDe(ops: Op[]): string {
  const VOLATILES = new Set(["how_at", "completed_at", "done_at"]);
  const texto = JSON.stringify(ops, (k, v) => (VOLATILES.has(k) ? undefined : v));
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

const MAX_NOMBRES = 4;

function nombres(lista: string[]): string {
  if (lista.length <= MAX_NOMBRES) return lista.join(", ");
  return `${lista.slice(0, MAX_NOMBRES).join(", ")} y ${lista.length - MAX_NOMBRES} más`;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

// ------------------------------------------------------------- planear

/**
 * El plan de importar `archivo` sobre `estado`.
 *
 * Los ids de lo nuevo vienen del archivo (`nuevoId`, nacidos en el navegador):
 * el mismo archivo leído una vez da el mismo plan siempre, que es lo que deja
 * comparar la huella al aplicar.
 */
export function planearImportacion(
  archivo: ArchivoProyecto,
  estado: EstadoParaImportar,
  opciones: OpcionesPlan,
): Plan {
  const ops: Op[] = [];
  const cambios: string[] = [];
  const seQueda: string[] = [];
  const noSeBorra: string[] = [];
  const avisos: string[] = archivo.avisos.map((a) => (a.linea ? `Línea ${a.linea}: ${a.texto}` : a.texto));

  const existente = estado.proyecto;
  const proyectoId = existente?.id ?? archivo.nuevoId;
  const nombre = existente?.name ?? archivo.nombre;

  const cuentas: Plan["cuentas"] = {
    personasNuevas: 0,
    personas: 0,
    miembros: 0,
    frentes: 0,
    etapas: 0,
    hitos: 0,
    tareasNuevas: 0,
    tareasHechas: 0,
    tareasCambian: 0,
    bitacora: 0,
    enlaces: 0,
    recordatorios: archivo.recordatorios.length,
  };

  const bloqueado = (motivo: string): Plan => ({
    proyectoId,
    nombre,
    nuevo: existente === null,
    ops: [],
    lineas: [],
    cambios: [],
    seQueda: [],
    noSeBorra: [],
    avisos,
    bloqueo: motivo,
    cuentas,
    huella: huellaDe([]),
  });

  // Lo que no es «completa» no se construye todavía. Subirlo entero sería
  // justo lo contrario de lo que pediste al marcarlo así.
  if (archivo.nube === "TITULOS" || archivo.nube === "RESERVADO") {
    return bloqueado(
      `Este proyecto está marcado «${archivo.nube === "TITULOS" ? "solo títulos" : "reservado"}». Esa forma de subirlo todavía no está lista, así que no subo nada. Si quieres verlo entero en la app, cambia la cabecera a «nube: completa».`,
    );
  }
  if (existente && existente.cloud_level !== "COMPLETA") {
    return bloqueado("Ese proyecto no está como «completa» en la app: no lo toco desde un archivo.");
  }

  // ----------------------------------------------------------- personas
  /** Nombre en el archivo (normalizado) → id de la persona. */
  const idDePersona = new Map<string, string>();
  const personasNuevas: string[] = [];
  const personasUsadas = new Set<string>();
  const personas = [...estado.personas];
  let yoId = personas.find((p) => p.is_owner)?.id ?? null;

  const asegurarYo = (nuevoId: string): string => {
    if (yoId) return yoId;
    yoId = nuevoId;
    ops.push({
      tabla: "core_people",
      accion: "crear",
      id: nuevoId,
      fila: { id: nuevoId, name: "Yo", is_owner: true, field_src: { name: "claude" } },
    });
    personas.push({
      id: nuevoId,
      name: "Yo",
      aliases: [],
      is_owner: true,
      archived_at: null,
      relation: null,
      note: null,
      whatsapp_hint: null,
      field_src: {},
    });
    return nuevoId;
  };

  const miembrosDelProyecto = new Set(estado.miembros.map((m) => m.person_id));

  /** Casa a una persona del archivo con una de la base, o la crea. */
  const persona = (p: Pick<PersonaArchivo, "ref" | "nuevoId" | "nombre" | "esYo" | "linea"> & Partial<PersonaArchivo>): string => {
    if (p.esYo) {
      const id = asegurarYo(p.nuevoId);
      idDePersona.set("yo", id);
      return id;
    }
    const clave = normalizeName(p.nombre);
    const yaVista = idDePersona.get(clave);
    if (yaVista) return yaVista;

    let elegida: PersonaExistente | undefined = p.ref ? personas.find((x) => x.id === p.ref && !x.is_owner) : undefined;
    if (!elegida) {
      const candidatas = findPeopleByName(p.nombre, personas);
      if (candidatas.length === 1) elegida = candidatas[0];
      else if (candidatas.length > 1) {
        // Con homónimos, la que ya está en el proyecto. Si ninguna, se crea una
        // nueva y se avisa: casar a la persona equivocada es peor que repetirla.
        elegida = candidatas.find((c) => miembrosDelProyecto.has(c.id));
        if (!elegida) {
          avisos.push(`Hay ${candidatas.length} personas que se llaman «${p.nombre}»: creo otra nueva. Si era una de ellas, únelas en la app.`);
        }
      }
    }

    if (elegida) {
      idDePersona.set(clave, elegida.id);
      personasUsadas.add(elegida.id);
      // Lo del archivo que es de la persona (no de su papel en el proyecto).
      const parche: Record<string, unknown> = {};
      const src: FieldSrc = { ...elegida.field_src };
      const nuevosAlias = (p.alias ?? []).filter(
        (a) => !elegida!.aliases.some((x) => normalizeName(x) === normalizeName(a)) && normalizeName(a) !== normalizeName(elegida!.name),
      );
      if (nuevosAlias.length > 0) {
        parche.aliases = [...elegida.aliases, ...nuevosAlias].slice(0, 20);
        src.aliases = src.aliases ?? "claude";
      }
      for (const [campo, actual, nuevo] of [
        ["relation", elegida.relation, p.relacion ?? null],
        ["note", elegida.note, p.nota ?? null],
        ["whatsapp_hint", elegida.whatsapp_hint, p.whatsapp ?? null],
      ] as const) {
        const d = decidir(campo, actual, nuevo, elegida.field_src);
        if (d === "poner" || d === "cambiar") {
          parche[campo] = nuevo;
          src[campo] = "claude";
        } else if (d === "tuyo") {
          seQueda.push(`${elegida.name}: ${campo === "relation" ? "quién es" : campo === "note" ? "tu nota" : "si tiene WhatsApp"} se queda como lo pusiste.`);
        }
      }
      if (Object.keys(parche).length > 0) {
        ops.push({ tabla: "core_people", accion: "cambiar", id: elegida.id, cambios: { ...parche, field_src: src } });
        cambios.push(`${elegida.name}: ${Object.keys(parche).map((k) => (k === "aliases" ? "alias" : k === "relation" ? "quién es" : k === "note" ? "nota" : "WhatsApp")).join(", ")}.`);
      }
      return elegida.id;
    }

    const id = p.nuevoId;
    const fila: Record<string, unknown> = { id, name: p.nombre };
    const src: FieldSrc = { name: "claude" };
    if (p.alias && p.alias.length > 0) {
      fila.aliases = p.alias;
      src.aliases = "claude";
    }
    if (p.relacion) {
      fila.relation = p.relacion;
      src.relation = "claude";
    }
    if (p.nota) {
      fila.note = p.nota;
      src.note = "claude";
    }
    if (p.whatsapp) {
      fila.whatsapp_hint = p.whatsapp;
      src.whatsapp_hint = "claude";
    }
    fila.field_src = src;
    ops.push({ tabla: "core_people", accion: "crear", id, fila });
    personas.push({
      id,
      name: p.nombre,
      aliases: p.alias ?? [],
      is_owner: false,
      archived_at: null,
      relation: p.relacion ?? null,
      note: p.nota ?? null,
      whatsapp_hint: p.whatsapp ?? null,
      field_src: src,
    });
    idDePersona.set(clave, id);
    personasNuevas.push(p.nombre);
    return id;
  };

  for (const p of archivo.personas) persona(p);

  const menciones: { personaId: string; nombre: string; linea: number }[] = [];

  /** Una mención («@Lucía») que no estaba en Personas: se busca o se crea. */
  const mencion = (texto: string | null, nuevoId: string, linea: number): string | null => {
    if (texto === null) return null;
    if (normalizeName(texto) === "yo") return persona({ ref: null, nuevoId, nombre: "Yo", esYo: true, linea });
    const ya = idDePersona.get(normalizeName(texto));
    if (ya) return ya;
    const enArchivo = archivo.personas.find((p) => p.alias.some((a) => normalizeName(a) === normalizeName(texto)));
    if (enArchivo) return persona(enArchivo);
    const id = persona({ ref: null, nuevoId, nombre: texto.slice(0, 80), esYo: false, linea });
    if (!archivo.personas.some((p) => normalizeName(p.nombre) === normalizeName(texto))) {
      avisos.push(`Línea ${linea}: «${texto}» no estaba en Personas; la añado al proyecto.`);
      menciones.push({ personaId: id, nombre: texto, linea });
    }
    return id;
  };
  // ----------------------------------------------------------- proyecto
  const nombresOcupados = new Set(
    estado.proyectos.filter((p) => p.id !== existente?.id).map((p) => normalizeName(p.name)),
  );

  if (!existente) {
    if (nombresOcupados.has(normalizeName(archivo.nombre))) {
      return bloqueado(`Ya tienes otro proyecto que se llama «${archivo.nombre}».`);
    }
    const slug = freeSlug(
      archivo.slug ?? archivo.nombre,
      estado.proyectos.map((p) => p.slug).filter((s): s is string => s !== null),
    );
    if (archivo.slug && slug !== archivo.slug) avisos.push(`El slug «${archivo.slug}» ya lo usa otro proyecto: le pongo «${slug}».`);
    const fila: Record<string, unknown> = {
      id: proyectoId,
      name: archivo.nombre,
      slug,
      status: archivo.estado ?? "EN_MARCHA",
      color: archivo.color ?? colorForName(archivo.nombre),
      cloud_level: "COMPLETA",
    };
    const src: FieldSrc = { name: "claude", slug: "claude", status: "claude", color: "claude" };
    const poner = (campo: string, valor: unknown) => {
      if (!vacio(valor)) {
        fila[campo] = valor;
        src[campo] = "claude";
      }
    };
    poner("aliases", archivo.alias);
    poner("objective", archivo.objetivo);
    poner("started_on", archivo.inicio);
    poner("target_on", archivo.meta);
    poner("icon", archivo.icono);
    if (archivo.comoVa) {
      fila.how_md = archivo.comoVa;
      fila.how_by = "CLAUDE";
      fila.how_at = opciones.ahora;
      src.how_md = "claude";
    }
    fila.field_src = src;
    // El proyecto va antes que todo lo que cuelga de él; las personas, antes
    // que él no hace falta, pero ya están arriba.
    ops.push({ tabla: "tasks_projects", accion: "crear", id: proyectoId, fila });
  } else {
    const parche: Record<string, unknown> = {};
    const src: FieldSrc = { ...existente.field_src };
    const etiquetas: Record<string, string> = {
      name: "nombre",
      status: "estado",
      objective: "objetivo",
      started_on: "inicio",
      target_on: "meta",
      color: "color",
      icon: "icono",
    };
    const nombreNuevo = archivo.ref === existente.id ? archivo.nombre : null;
    if (nombreNuevo && nombresOcupados.has(normalizeName(nombreNuevo))) {
      avisos.push(`No le cambio el nombre a «${nombreNuevo}»: ya lo usa otro proyecto.`);
    }
    for (const [campo, actual, nuevo] of [
      ["name", existente.name, nombreNuevo && !nombresOcupados.has(normalizeName(nombreNuevo)) ? nombreNuevo : null],
      ["status", existente.status, archivo.estado],
      ["objective", existente.objective, archivo.objetivo],
      ["started_on", existente.started_on, archivo.inicio],
      ["target_on", existente.target_on, archivo.meta],
      ["color", existente.color, archivo.color],
      ["icon", existente.icon, archivo.icono],
    ] as const) {
      const d = decidir(campo, actual, nuevo, existente.field_src);
      if (d === "poner" || d === "cambiar") {
        parche[campo] = nuevo;
        src[campo] = "claude";
        const antes =
          campo === "status" && actual ? PROJECT_STATUS_LABELS[actual as ProjectStatus] : actual ?? "vacío";
        const despues = campo === "status" && nuevo ? PROJECT_STATUS_LABELS[nuevo as ProjectStatus] : nuevo;
        cambios.push(
          d === "poner"
            ? `Proyecto: pongo ${etiquetas[campo]} «${despues}».`
            : `Proyecto: ${etiquetas[campo]} «${antes}» pasa a «${despues}».`,
        );
      } else if (d === "tuyo") {
        seQueda.push(`Proyecto: el ${etiquetas[campo]} lo pusiste tú («${campo === "status" ? PROJECT_STATUS_LABELS[actual as ProjectStatus] : actual}»).`);
      }
    }
    if (!existente.slug) {
      const slug = freeSlug(
        archivo.slug ?? existente.name,
        estado.proyectos.filter((p) => p.id !== existente.id).map((p) => p.slug).filter((s): s is string => s !== null),
      );
      parche.slug = slug;
      src.slug = "claude";
    }
    const aliasNuevos = archivo.alias.filter((a) => !existente.aliases.some((x) => normalizeName(x) === normalizeName(a)));
    if (aliasNuevos.length > 0) {
      parche.aliases = [...existente.aliases, ...aliasNuevos].slice(0, 20);
      src.aliases = src.aliases ?? "claude";
      cambios.push(`Proyecto: alias nuevos ${aliasNuevos.join(", ")}.`);
    }
    if (archivo.comoVa && !iguales(existente.how_md, archivo.comoVa)) {
      if (existente.how_md === null || existente.how_by === "CLAUDE") {
        parche.how_md = archivo.comoVa;
        parche.how_by = "CLAUDE";
        parche.how_at = opciones.ahora;
        src.how_md = "claude";
        cambios.push("Proyecto: «Cómo va» nuevo.");
      } else {
        seQueda.push("«Cómo va» lo escribiste tú: no lo piso.");
      }
    }
    if (Object.keys(parche).length > 0) {
      ops.push({ tabla: "tasks_projects", accion: "cambiar", id: existente.id, cambios: { ...parche, field_src: src } });
    }
  }

  // ----------------------------------------------------------- miembros
  const miembroDe = new Map(estado.miembros.map((m) => [m.person_id, m]));
  const miembrosVistos = new Set<string>();
  const ponerMiembro = (
    personaId: string,
    datos: { papel: string | null; lado: MemberSide | null; hace: string | null },
    quien: string,
    nuevoId: string,
  ) => {
    if (miembrosVistos.has(personaId)) return;
    miembrosVistos.add(personaId);
    cuentas.miembros += 1;
    const actual = miembroDe.get(personaId);
    if (!actual) {
      const fila: Record<string, unknown> = { id: nuevoId, project_id: proyectoId, person_id: personaId };
      const src: FieldSrc = {};
      if (datos.papel) {
        fila.role = datos.papel;
        src.role = "claude";
      }
      if (datos.lado) {
        fila.side = datos.lado;
        src.side = "claude";
      }
      if (datos.hace) {
        fila.does_md = datos.hace;
        src.does_md = "claude";
      }
      fila.field_src = src;
      ops.push({ tabla: "tasks_project_members", accion: "crear", id: nuevoId, fila });
      return;
    }
    const parche: Record<string, unknown> = {};
    const src: FieldSrc = { ...actual.field_src };
    for (const [campo, antes, nuevo, etiqueta] of [
      ["role", actual.role, datos.papel, "papel"],
      ["side", actual.side, datos.lado, "lado"],
      ["does_md", actual.does_md, datos.hace, "qué hace"],
    ] as const) {
      const d = decidir(campo, antes, nuevo, actual.field_src);
      if (d === "poner" || d === "cambiar") {
        parche[campo] = nuevo;
        src[campo] = "claude";
        cambios.push(`${quien}: ${etiqueta} ${d === "poner" ? "nuevo" : "cambia"}.`);
      } else if (d === "tuyo") {
        seQueda.push(`${quien}: «${etiqueta}» lo escribiste tú.`);
      }
    }
    if (Object.keys(parche).length > 0) {
      ops.push({ tabla: "tasks_project_members", accion: "cambiar", id: actual.id, cambios: { ...parche, field_src: src } });
    }
  };

  // Los miembros van cuando el proyecto ya existe (las operaciones van en
  // orden): primero personas, luego proyecto, luego esto.
  for (const p of archivo.personas) {
    const id = p.esYo ? (yoId as string) : (idDePersona.get(normalizeName(p.nombre)) as string);
    ponerMiembro(id, { papel: p.papel, lado: p.lado, hace: p.hace }, p.esYo ? "Tú" : p.nombre, idDerivado(p.nuevoId, "miembro"));
  }

  // ----------------------------------------------------------- frentes
  const frentePorNombre = new Map(estado.frentes.map((f) => [normalizeName(f.name), f]));
  const idDeFrente = new Map<string, string>();
  for (const f of archivo.frentes) {
    const actual = (f.ref ? estado.frentes.find((x) => x.id === f.ref) : undefined) ?? frentePorNombre.get(normalizeName(f.nombre));
    const lider = f.responsable ? mencion(f.responsable, idDerivado(f.nuevoId, "responsable"), f.linea) : null;
    cuentas.frentes += 1;
    if (!actual) {
      const fila: Record<string, unknown> = { id: f.nuevoId, project_id: proyectoId, name: f.nombre, sort_order: cuentas.frentes };
      const src: FieldSrc = { name: "claude" };
      if (lider) {
        fila.lead_person_id = lider;
        src.lead_person_id = "claude";
      }
      fila.field_src = src;
      ops.push({ tabla: "tasks_streams", accion: "crear", id: f.nuevoId, fila });
      idDeFrente.set(normalizeName(f.nombre), f.nuevoId);
      continue;
    }
    idDeFrente.set(normalizeName(f.nombre), actual.id);
    idDeFrente.set(normalizeName(actual.name), actual.id);
    const d = decidir("lead_person_id", actual.lead_person_id, lider, actual.field_src);
    if (d === "poner" || d === "cambiar") {
      ops.push({
        tabla: "tasks_streams",
        accion: "cambiar",
        id: actual.id,
        cambios: { lead_person_id: lider, field_src: { ...actual.field_src, lead_person_id: "claude" } },
      });
      cambios.push(`Frente ${actual.name}: responsable nuevo.`);
    } else if (d === "tuyo") {
      seQueda.push(`Frente ${actual.name}: el responsable lo pusiste tú.`);
    }
  }

  // ----------------------------------------------------------- etapas e hitos
  const etapasExistentes = estado.hitos.filter((h) => h.kind === "ETAPA");
  const hitosExistentes = estado.hitos.filter((h) => h.kind === "HITO");
  const idDeEtapa: string[] = [];

  archivo.etapas.forEach((e, i) => {
    const actual =
      (e.ref ? etapasExistentes.find((x) => x.id === e.ref) : undefined) ??
      etapasExistentes.find((x) => normalizeName(x.title) === normalizeName(e.titulo));
    cuentas.etapas += 1;
    if (!actual) {
      const fila: Record<string, unknown> = {
        id: e.nuevoId,
        project_id: proyectoId,
        kind: "ETAPA",
        title: e.titulo,
        sort_order: i + 1,
      };
      const src: FieldSrc = { title: "claude" };
      if (e.inicio) {
        fila.starts_on = e.inicio;
        src.starts_on = "claude";
      }
      if (e.fin) {
        fila.due_on = e.fin;
        src.due_on = "claude";
      }
      fila.field_src = src;
      ops.push({ tabla: "tasks_milestones", accion: "crear", id: e.nuevoId, fila });
      idDeEtapa.push(e.nuevoId);
      return;
    }
    idDeEtapa.push(actual.id);
    const parche: Record<string, unknown> = {};
    const src: FieldSrc = { ...actual.field_src };
    for (const [campo, antes, nuevo] of [
      ["title", actual.title, e.ref === actual.id ? e.titulo : null],
      ["starts_on", actual.starts_on, e.inicio],
      ["due_on", actual.due_on, e.fin],
    ] as const) {
      const d = decidir(campo, antes, nuevo, actual.field_src);
      if (d === "poner" || d === "cambiar") {
        parche[campo] = nuevo;
        src[campo] = "claude";
      } else if (d === "tuyo") {
        seQueda.push(`Etapa «${actual.title}»: ${campo === "title" ? "el nombre" : "las fechas"} las pusiste tú.`);
      }
    }
    if (Object.keys(parche).length > 0) {
      ops.push({ tabla: "tasks_milestones", accion: "cambiar", id: actual.id, cambios: { ...parche, field_src: src } });
      cambios.push(`Etapa «${actual.title}»: cambia.`);
    }
  });

  const idDeHito = new Map<string, string>();
  archivo.hitos.forEach((h: HitoArchivo, i) => {
    const etapa = h.etapa !== null ? (idDeEtapa[h.etapa] ?? null) : null;
    const responsable = h.responsable ? mencion(h.responsable, idDerivado(h.nuevoId, "responsable"), h.linea) : null;
    const actual =
      (h.ref ? hitosExistentes.find((x) => x.id === h.ref) : undefined) ??
      hitosExistentes.find((x) => normalizeName(x.title) === normalizeName(h.titulo));
    cuentas.hitos += 1;
    if (!actual) {
      const fila: Record<string, unknown> = {
        id: h.nuevoId,
        project_id: proyectoId,
        kind: "HITO",
        title: h.titulo,
        status: h.estado,
        due_precision: h.precision,
        sort_order: i + 1,
      };
      const src: FieldSrc = { title: "claude", status: "claude", due_precision: "claude" };
      if (etapa) {
        fila.stage_id = etapa;
        src.stage_id = "claude";
      }
      if (h.fecha) {
        fila.due_on = h.fecha;
        src.due_on = "claude";
      }
      if (responsable) {
        fila.owner_person_id = responsable;
        src.owner_person_id = "claude";
      }
      if (h.detalle) {
        fila.detail = h.detalle;
        src.detail = "claude";
      }
      if (h.estado === "HECHO") fila.done_at = opciones.ahora;
      fila.field_src = src;
      ops.push({ tabla: "tasks_milestones", accion: "crear", id: h.nuevoId, fila });
      idDeHito.set(normalizeName(h.titulo), h.nuevoId);
      return;
    }
    idDeHito.set(normalizeName(h.titulo), actual.id);
    const parche: Record<string, unknown> = {};
    const src: FieldSrc = { ...actual.field_src };
    for (const [campo, antes, nuevo] of [
      ["title", actual.title, h.ref === actual.id ? h.titulo : null],
      ["due_on", actual.due_on, h.fecha],
      ["owner_person_id", actual.owner_person_id, responsable],
      ["stage_id", actual.stage_id, etapa],
      ["detail", actual.detail, h.detalle],
    ] as const) {
      const d = decidir(campo, antes, nuevo, actual.field_src);
      if (d === "poner" || d === "cambiar") {
        parche[campo] = nuevo;
        src[campo] = "claude";
        if (campo === "due_on") parche.due_precision = h.precision;
      } else if (d === "tuyo" && campo !== "stage_id") {
        seQueda.push(`Hito «${actual.title}»: ${campo === "due_on" ? "la fecha" : campo === "title" ? "el nombre" : campo === "detail" ? "el detalle" : "el responsable"} lo pusiste tú.`);
      }
    }
    // El estado: hecho es definitivo. Si no, se cambia salvo que lo pusieras
    // tú (o, sin marca, que no sea el de partida).
    if (actual.status !== h.estado) {
      const tuyo =
        actual.field_src.status === "owner" ||
        (actual.field_src.status === undefined && actual.status !== "PENDIENTE");
      if (actual.status === "HECHO") {
        noSeBorra.push(`El hito «${actual.title}» está hecho: sólo tú lo reabres.`);
      } else if (tuyo) {
        seQueda.push(`Hito «${actual.title}»: el estado lo pusiste tú.`);
      } else {
        parche.status = h.estado;
        src.status = "claude";
        if (h.estado === "HECHO") parche.done_at = opciones.ahora;
      }
    }
    if (Object.keys(parche).length > 0) {
      ops.push({ tabla: "tasks_milestones", accion: "cambiar", id: actual.id, cambios: { ...parche, field_src: src } });
      cambios.push(`Hito «${actual.title}»: ${Object.keys(parche).filter((k) => k !== "done_at" && k !== "due_precision").map((k) => ({ title: "nombre", due_on: "fecha", owner_person_id: "responsable", stage_id: "etapa", detail: "detalle", status: "estado" })[k] ?? k).join(", ")}.`);
    }
  });

  // ----------------------------------------------------------- tareas
  const tareasExistentes = estado.tareas;
  const idDeTarea: (string | null)[] = [];
  const tareasCasadas = new Set<string>();

  archivo.tareas.forEach((t: TareaArchivo) => {
    const padre = t.padre !== null ? (idDeTarea[t.padre] ?? null) : null;
    const actual =
      (t.ref ? tareasExistentes.find((x) => x.id === t.ref) : undefined) ??
      tareasExistentes.find(
        (x) => !tareasCasadas.has(x.id) && normalizeName(x.title) === normalizeName(t.titulo) && x.parent_id === padre,
      );

    if (t.quitar) {
      if (actual) noSeBorra.push(`«${actual.title}» lleva [-]: la importación nunca borra; quítala en la app si quieres.`);
      else avisos.push(`Línea ${t.linea}: «${t.titulo}» lleva [-] y no existe: no la creo.`);
      idDeTarea.push(actual?.id ?? null);
      if (actual) tareasCasadas.add(actual.id);
      return;
    }

    const responsable = mencion(t.responsable, idDerivado(t.nuevoId, "responsable"), t.linea);
    let frente: string | null = null;
    if (t.frente) {
      frente = idDeFrente.get(normalizeName(t.frente)) ?? null;
      if (!frente) {
        const nuevoFrente = idDerivado(t.nuevoId, "frente");
        ops.push({
          tabla: "tasks_streams",
          accion: "crear",
          id: nuevoFrente,
          fila: { id: nuevoFrente, project_id: proyectoId, name: t.frente.slice(0, 60), field_src: { name: "claude" } },
        });
        idDeFrente.set(normalizeName(t.frente), nuevoFrente);
        frente = nuevoFrente;
        cuentas.frentes += 1;
        avisos.push(`Línea ${t.linea}: el frente «${t.frente}» no estaba en Frentes; lo creo.`);
      }
    }

    if (!actual) {
      const fila: Record<string, unknown> = {
        id: t.nuevoId,
        project_id: proyectoId,
        title: t.titulo,
        status: t.estado,
        priority: t.prioridad ?? "MEDIA",
        origin: "CLAUDE",
      };
      const src: FieldSrc = { title: "claude", status: "claude", priority: "claude" };
      const poner = (campo: string, valor: unknown) => {
        if (!vacio(valor)) {
          fila[campo] = valor;
          src[campo] = "claude";
        }
      };
      poner("assignee_id", responsable);
      poner("due_date", t.fecha);
      poner("stream_id", frente);
      poner("parent_id", padre);
      poner("notes", t.notas);
      if (t.origen) {
        fila.source_kind = t.origen.tipo ?? ("CLAUDE" satisfies SourceKind);
        fila.source_label = t.origen.texto;
      } else {
        fila.source_kind = "CLAUDE";
      }
      if (t.estado === "HECHA") fila.completed_at = opciones.ahora;
      fila.field_src = src;
      ops.push({ tabla: "tasks_items", accion: "crear", id: t.nuevoId, fila });
      idDeTarea.push(t.nuevoId);
      cuentas.tareasNuevas += 1;
      if (t.estado === "HECHA") cuentas.tareasHechas += 1;
      return;
    }

    tareasCasadas.add(actual.id);
    idDeTarea.push(actual.id);
    const parche: Record<string, unknown> = {};
    const src: FieldSrc = { ...actual.field_src };
    const etiqueta: Record<string, string> = {
      title: "nombre",
      due_date: "fecha",
      priority: "prioridad",
      assignee_id: "responsable",
      stream_id: "frente",
      notes: "nota",
    };
    for (const [campo, antes, nuevo] of [
      ["title", actual.title, t.ref === actual.id ? t.titulo : null],
      ["due_date", actual.due_date, t.fecha],
      ["priority", actual.priority === "MEDIA" ? null : actual.priority, t.prioridad],
      ["assignee_id", actual.assignee_id, responsable],
      ["stream_id", actual.stream_id, frente],
      ["notes", actual.notes, t.notas],
    ] as const) {
      const d = decidir(campo, antes, nuevo, actual.field_src);
      if (d === "poner" || d === "cambiar") {
        parche[campo] = nuevo;
        src[campo] = "claude";
        if (campo === "due_date") {
          cambios.push(`«${actual.title}»: fecha ${antes ? `${shortDate(antes, opciones.hoy)} → ` : ""}${shortDate(nuevo as string, opciones.hoy)}.`);
        } else {
          cambios.push(`«${actual.title}»: ${etiqueta[campo]} ${d === "poner" ? "nuevo" : "cambia"}.`);
        }
      } else if (d === "tuyo") {
        seQueda.push(`«${actual.title}»: ${campo === "due_date" ? `la fecha (${shortDate(antes as string, opciones.hoy)})` : `el ${etiqueta[campo]}`} lo pusiste tú.`);
      }
    }
    // El estado: hecha es definitivo (sólo tú reabres). Si no, se cambia salvo
    // que lo pusieras tú (o, sin marca, que no sea el de partida).
    if (actual.status !== t.estado) {
      const tuyo =
        actual.field_src.status === "owner" ||
        (actual.field_src.status === undefined && actual.status !== "NO_INICIADA");
      if (actual.status === "HECHA") {
        noSeBorra.push(`«${actual.title}» está hecha: sólo tú la reabres.`);
      } else if (tuyo) {
        seQueda.push(`«${actual.title}»: el estado lo pusiste tú.`);
      } else {
        parche.status = t.estado;
        src.status = "claude";
        if (t.estado === "HECHA") {
          parche.completed_at = opciones.ahora;
          cambios.push(`«${actual.title}»: la cierro.`);
        } else {
          cambios.push(`«${actual.title}»: ${t.estado === "EN_CURSO" ? "pasa a en curso" : "vuelve a pendiente"}.`);
        }
      }
    }
    if (Object.keys(parche).length > 0) {
      parche.field_src = src;
      ops.push({ tabla: "tasks_items", accion: "cambiar", id: actual.id, cambios: parche });
      cuentas.tareasCambian += 1;
    }
  });

  const fuera = tareasExistentes.filter((x) => !tareasCasadas.has(x.id) && x.status !== "HECHA").length;
  if (existente && fuera > 0) {
    noSeBorra.push(`${plural(fuera, "tarea abierta de la app no está", "tareas abiertas de la app no están")} en el archivo: se quedan como están.`);
  }

  // Las personas que sólo salían como «@alguien» entran al proyecto.
  for (const m of menciones) {
    ponerMiembro(m.personaId, { papel: null, lado: null, hace: null }, m.nombre, idDerivado(`${proyectoId}:${m.personaId}`, "miembro"));
  }

  // ----------------------------------------------------------- bitácora
  archivo.bitacora.forEach((b) => {
    const titulo = b.texto.length > 160 ? `${b.texto.slice(0, 157).trim()}…` : b.texto;
    const ya =
      (b.ref ? estado.bitacora.find((x) => x.id === b.ref) : undefined) ??
      estado.bitacora.find((x) => x.at.slice(0, 10) === b.fecha && normalizeName(x.title) === normalizeName(titulo));
    if (ya) return;
    cuentas.bitacora += 1;
    const fila: Record<string, unknown> = {
      id: b.nuevoId,
      project_id: proyectoId,
      at: `${b.fecha}T12:00:00Z`,
      kind: b.tipo satisfies LogKind,
      title: titulo,
      origin: "CLAUDE",
    };
    if (b.texto.length > 160) fila.body = b.texto;
    ops.push({ tabla: "tasks_project_log", accion: "crear", id: b.nuevoId, fila });
  });

  // ----------------------------------------------------------- enlaces
  archivo.enlaces.forEach((l) => {
    const ya =
      (l.ref ? estado.enlaces.find((x) => x.id === l.ref) : undefined) ??
      estado.enlaces.find((x) => (l.url ? x.ref === l.url : normalizeName(x.label) === normalizeName(l.etiqueta)));
    if (ya) return;
    cuentas.enlaces += 1;
    ops.push({
      tabla: "tasks_project_sources",
      accion: "crear",
      id: l.nuevoId,
      fila: {
        id: l.nuevoId,
        project_id: proyectoId,
        kind: l.url ? "ENLACE" : "ARCHIVO_MAC",
        label: l.etiqueta,
        ref: l.url,
        lives: l.url ? "NUBE" : "MAC",
        origin: "CLAUDE",
      },
    });
  });

  // ----------------------------------------------------------- ficha
  let ficha: "nueva" | "cambia" | "igual" | "tuya" | null = null;
  if (archivo.ficha) {
    if (!estado.ficha) {
      const id = idDerivado(archivo.nuevoId, "ficha");
      ops.push({
        tabla: "tasks_project_docs",
        accion: "crear",
        id,
        fila: { id, project_id: proyectoId, kind: "FICHA", title: "Ficha técnica", body_md: archivo.ficha, made_by: "CLAUDE" },
      });
      ficha = "nueva";
    } else if (iguales(estado.ficha.body_md, archivo.ficha)) {
      ficha = "igual";
    } else if (estado.ficha.made_by === "CLAUDE") {
      ops.push({
        tabla: "tasks_project_docs",
        accion: "cambiar",
        id: estado.ficha.id,
        cambios: { body_md: archivo.ficha, made_by: "CLAUDE" },
      });
      ficha = "cambia";
      cambios.push("La ficha técnica cambia (la anterior queda guardada como versión).");
    } else {
      ficha = "tuya";
      seQueda.push("La ficha técnica la editaste tú: no la piso.");
    }
  }

  // ----------------------------------------------------------- frases
  cuentas.personas = idDePersona.size;
  cuentas.personasNuevas = personasNuevas.length;

  const lineas: string[] = [];
  lineas.push(existente ? `${nombre} (ya existe: lo pongo al día)` : `${archivo.nombre} (nuevo)`);
  const personasTexto = `Personas: ${cuentas.personas}${personasNuevas.length > 0 ? ` (${plural(personasNuevas.length, "nueva", "nuevas")}: ${nombres(personasNuevas)})` : ""}`;
  lineas.push(personasTexto);
  const tareasTexto = `Tareas: ${cuentas.tareasNuevas}${existente ? ` nuevas${cuentas.tareasCambian > 0 ? `, ${cuentas.tareasCambian} cambian` : ""}` : ""}${cuentas.tareasHechas > 0 ? ` (${plural(cuentas.tareasHechas, "hecha", "hechas")})` : ""}`;
  lineas.push(
    [
      `Frentes: ${cuentas.frentes}`,
      `Etapas: ${cuentas.etapas}`,
      `Hitos: ${cuentas.hitos}`,
      tareasTexto,
      `Bitácora: ${cuentas.bitacora}`,
      `Enlaces: ${cuentas.enlaces}`,
    ].join(" · "),
  );
  if (ficha !== null) {
    lineas.push(
      `Ficha técnica: ${{ nueva: "nueva", cambia: "cambia", igual: "igual que la de la app", tuya: "se queda la tuya" }[ficha]}`,
    );
  }
  if (cuentas.recordatorios > 0) {
    lineas.push(
      `Recordatorios: ${cuentas.recordatorios} (no se cargan todavía: llegarán con los recordatorios que suenan)`,
    );
  }
  lineas.push(`Cambia: ${cambios.length === 0 ? "nada" : plural(cambios.length, "cosa", "cosas")} · Se borra: nada`);
  if (archivo.faltan > 0) {
    lineas.push(`Quedan ${plural(archivo.faltan, "dato por rellenar", "datos por rellenar")} («falta…»).`);
  }

  return {
    proyectoId,
    nombre: existente ? nombre : archivo.nombre,
    nuevo: existente === null,
    ops,
    lineas,
    cambios,
    seQueda,
    noSeBorra,
    avisos,
    bloqueo: null,
    cuentas,
    huella: huellaDe(ops),
  };
}
