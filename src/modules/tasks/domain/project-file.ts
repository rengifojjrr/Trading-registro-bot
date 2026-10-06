import { normalizeName, isMe } from "@/core/people";
import { uuidv7 } from "@/core/ids";
import type {
  CloudLevel,
  DuePrecision,
  LogKind,
  MemberSide,
  MilestoneStatus,
  ProjectColor,
  ProjectStatus,
  SourceKind,
} from "@/types/database";

import { PROJECT_LIMITS, PROJECT_NAME_MAX } from "./projects";
import type { TaskPriority, TaskStatus } from "./tasks";

/**
 * El archivo de un proyecto: lo que Claude escribe en la Mac y la aplicación
 * lee. Un solo lector, éste, que corre en el navegador antes de enviar nada.
 *
 * Es Markdown con encabezados fijos y una línea por cosa, para que se lea sin
 * IA y lo pueda escribir a mano cualquiera:
 *
 *     ---
 *     proyecto: Casa nueva
 *     estado: en marcha
 *     objetivo: Mudarnos antes de diciembre
 *     ---
 *     ## Cómo va
 *     ## Ficha técnica
 *     ## Personas        (tabla: Persona | Papel | Lado | Qué hace | WhatsApp)
 *     ## Frentes         (- Permisos (Ana) · Obra (Luis))
 *     ## Hoja de ruta    (### Etapa 1 — Título (2026-10-01 → 2026-10-31) y sus hitos)
 *     ## Tareas          (- [ ] Título — @persona — 2026-10-15 — #Frente — (llamada 5 oct))
 *     ## Recordatorios
 *     ## Bitácora        (- 2026-10-05 — decisión — Texto)
 *     ## Enlaces         (- Título — https://…)
 *
 * La plantilla completa y sus reglas están en `docs/proyectos-plantilla.md` del
 * agente. Al exportar, cada línea lleva su id en un comentario
 * (`<!-- t:… -->`): así, volver a cargar el archivo cambia en vez de duplicar.
 *
 * El lector es tolerante con lo que no encaja -- lo salta y lo dice en
 * `avisos` -- y estricto en una sola cosa: un archivo `.privado` no se lee
 * nunca. Lo privado (montos, contrapartes, contratos) vive en la Mac.
 */

// ------------------------------------------------------------------ modelo

export interface Aviso {
  /** Línea del archivo, empezando en 1, cuando la hay. */
  linea: number | null;
  texto: string;
}

/** Cada cosa trae el id que ya tenía (si el archivo lo dice) y uno nuevo por si hace falta. */
export interface ConId {
  /** El id que trae el archivo en su comentario, si lo trae. */
  ref: string | null;
  /** Un id nuevo, nacido aquí, por si hay que crearla. */
  nuevoId: string;
}

export interface PersonaArchivo extends ConId {
  nombre: string;
  esYo: boolean;
  alias: string[];
  relacion: string | null;
  papel: string | null;
  lado: MemberSide | null;
  hace: string | null;
  whatsapp: "SI" | "NO" | null;
  nota: string | null;
  linea: number;
}

export interface FrenteArchivo extends ConId {
  nombre: string;
  responsable: string | null;
  linea: number;
}

export interface EtapaArchivo extends ConId {
  titulo: string;
  inicio: string | null;
  fin: string | null;
  linea: number;
}

export interface HitoArchivo extends ConId {
  titulo: string;
  fecha: string | null;
  precision: DuePrecision;
  estado: MilestoneStatus;
  responsable: string | null;
  /** Índice en `etapas`, o nulo si va suelto. */
  etapa: number | null;
  detalle: string | null;
  linea: number;
}

export interface OrigenArchivo {
  tipo: SourceKind | null;
  texto: string;
}

export interface TareaArchivo extends ConId {
  titulo: string;
  estado: TaskStatus;
  /** `[-]`: quien escribió el archivo quiere quitarla. La importación nunca borra. */
  quitar: boolean;
  responsable: string | null;
  fecha: string | null;
  frente: string | null;
  prioridad: TaskPriority | null;
  origen: OrigenArchivo | null;
  notas: string | null;
  /** Índice en `tareas` de su tarea madre, si es una subtarea. */
  padre: number | null;
  linea: number;
}

export interface EntradaArchivo extends ConId {
  fecha: string;
  tipo: LogKind;
  texto: string;
  linea: number;
}

export interface EnlaceArchivo extends ConId {
  etiqueta: string;
  url: string | null;
  enMac: boolean;
  linea: number;
}

export interface ArchivoProyecto extends ConId {
  nombre: string;
  slug: string | null;
  alias: string[];
  estado: ProjectStatus | null;
  nube: CloudLevel | null;
  objetivo: string | null;
  inicio: string | null;
  meta: string | null;
  color: ProjectColor | null;
  icono: string | null;
  comoVa: string | null;
  ficha: string | null;
  personas: PersonaArchivo[];
  frentes: FrenteArchivo[];
  etapas: EtapaArchivo[];
  hitos: HitoArchivo[];
  tareas: TareaArchivo[];
  recordatorios: string[];
  bitacora: EntradaArchivo[];
  enlaces: EnlaceArchivo[];
  avisos: Aviso[];
  /** Cuántos «(falta…)» quedan por rellenar. */
  faltan: number;
}

export type Lectura = { ok: true; archivo: ArchivoProyecto } | { ok: false; error: string };

export interface OpcionesLectura {
  /** El nombre del archivo elegido, si se eligió uno. */
  nombreArchivo?: string;
  /** Para las pruebas: ids predecibles. */
  nuevoId?: () => string;
  /** Para completar fechas sin año («05/10»). `YYYY-MM-DD`. */
  hoy?: string;
}

/** Más grande que esto no es un proyecto: es un archivo equivocado. */
export const ARCHIVO_MAX_CARACTERES = 200_000;

export const LIMITES_ARCHIVO = {
  personas: 200,
  frentes: 60,
  etapas: 60,
  hitos: 400,
  tareas: 1500,
  bitacora: 800,
  enlaces: 300,
  recordatorios: 100,
} as const;

// ------------------------------------------------------------- privacidad

/**
 * ¿Es la mitad privada de un proyecto?
 *
 * Tres señales, cualquiera basta: el nombre del archivo lleva `.privado`, la
 * cabecera dice `privado: sí`, o uno de sus primeros encabezados o
 * comentarios dice PRIVADO en mayúsculas (así empieza la plantilla del
 * `.privado.md`). Pegar uno de éstos por error tiene que pararse aquí, antes
 * de que nada salga del navegador.
 */
export function esArchivoPrivado(texto: string, nombreArchivo?: string): boolean {
  if (nombreArchivo && /\.privad[oa]\b/i.test(nombreArchivo)) return true;
  const cabecera = leerCabecera(texto.replace(/\r\n?/g, "\n").split("\n"));
  const privado = cabecera?.valores.get("privado");
  if (privado !== undefined && /^(si|sí|true|yes|1)$/i.test(privado.trim())) return true;
  const primeras = texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .slice(0, 12);
  return primeras.some(
    (linea) => /^\s*#{1,3}\s.*\bPRIVADO\b/.test(linea) || /<!--\s*PRIVADO\b/.test(linea),
  );
}

// ------------------------------------------------------------- utilidades

type Prefijo = "id" | "p" | "f" | "e" | "h" | "t" | "b" | "l";

const TOKEN = /⟦(id|p|f|e|h|t|b|l):([0-9a-f-]{36})⟧/gi;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quita y devuelve el id de una línea. */
function sacarId(linea: string, prefijo: Prefijo): { texto: string; ref: string | null } {
  let ref: string | null = null;
  const texto = linea.replace(TOKEN, (_todo, p: string, id: string) => {
    if (p.toLowerCase() === prefijo && UUID.test(id) && ref === null) ref = id.toLowerCase();
    return "";
  });
  return { texto: texto.replace(/\s+$/g, ""), ref };
}

function limpiarTokens(texto: string): string {
  return texto.replace(TOKEN, "").trim();
}

/** Clave de cabecera o de columna: sin tildes ni mayúsculas. */
function clave(texto: string): string {
  return normalizeName(texto).replace(/\s+/g, " ");
}

function recortar(texto: string | null, max: number, avisos: Aviso[], linea: number | null, que: string): string | null {
  if (texto === null) return null;
  const t = texto.trim();
  if (t === "") return null;
  if (t.length <= max) return t;
  avisos.push({ linea, texto: `${que} pasa de ${max} caracteres: lo corto.` });
  return t.slice(0, max).trim();
}

function sinNegritas(texto: string): string {
  return texto.replace(/\*\*|__/g, "").replace(/(^|\s)[*_](\S[^*_]*)[*_](?=\s|$)/g, "$1$2").trim();
}

function esFalta(texto: string): boolean {
  return /^\(?\s*falta\b/i.test(texto.trim()) || /^\(?\s*por definir\s*\)?$/i.test(texto.trim());
}

/** Separadores de campo dentro de una línea: « — », « – » o « -- ». */
function segmentos(texto: string): string[] {
  return texto
    .split(/\s+[—–]\s+|\s+--\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function fechaValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function ultimoDiaDelMes(anio: number, mes: number): string {
  const d = new Date(Date.UTC(anio, mes, 0, 12));
  return d.toISOString().slice(0, 10);
}

interface FechaLeida {
  /** El día en que vence (el último del mes si sólo se dijo el mes). */
  fecha: string;
  /** El primero del periodo, cuando es un mes. */
  desde: string;
  precision: DuePrecision;
}

/** `2026-10-15`, `2026-10`, `15/10/2026` o `15/10` (del año de `hoy`). */
function leerFecha(texto: string, hoy: string): FechaLeida | null {
  const t = texto.trim().replace(/[.,;]$/, "");
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m && fechaValida(t)) return { fecha: t, desde: t, precision: "DIA" };
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    if (mes >= 1 && mes <= 12) {
      return { fecha: ultimoDiaDelMes(anio, mes), desde: `${m[1]}-${m[2]}-01`, precision: "MES" };
    }
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const anio = m[3] ?? hoy.slice(0, 4);
    const iso = `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (fechaValida(iso)) return { fecha: iso, desde: iso, precision: "DIA" };
  }
  return null;
}

const ESTADOS: Record<string, ProjectStatus> = {
  idea: "IDEA",
  "en marcha": "EN_MARCHA",
  marcha: "EN_MARCHA",
  activo: "EN_MARCHA",
  arrancando: "EN_MARCHA",
  esperando: "ESPERANDO",
  "esperando a otros": "ESPERANDO",
  atascado: "ATASCADO",
  bloqueado: "ATASCADO",
  "en pausa": "EN_PAUSA",
  pausa: "EN_PAUSA",
  pausado: "EN_PAUSA",
  terminado: "TERMINADO",
  cerrado: "TERMINADO",
  hecho: "TERMINADO",
  descartado: "DESCARTADO",
};

const NUBES: Record<string, CloudLevel> = {
  completa: "COMPLETA",
  "solo titulos": "TITULOS",
  titulos: "TITULOS",
  reservado: "RESERVADO",
  reservada: "RESERVADO",
};

const COLORES: Record<string, ProjectColor> = {
  default: "default",
  gray: "gray",
  gris: "gray",
  brown: "brown",
  marron: "brown",
  orange: "orange",
  naranja: "orange",
  yellow: "yellow",
  amarillo: "yellow",
  green: "green",
  verde: "green",
  blue: "blue",
  azul: "blue",
  purple: "purple",
  morado: "purple",
  pink: "pink",
  rosa: "pink",
  red: "red",
  rojo: "red",
};

const LADOS: Record<string, MemberSide> = {
  nosotros: "NOSOTROS",
  nuestro: "NOSOTROS",
  "nuestro lado": "NOSOTROS",
  contraparte: "CONTRAPARTE",
  "otra parte": "CONTRAPARTE",
  "la otra parte": "CONTRAPARTE",
  ellos: "CONTRAPARTE",
  asesor: "ASESOR",
  asesora: "ASESOR",
  otro: "OTRO",
};

const TIPOS_BITACORA: Record<string, LogKind> = {
  nota: "NOTA",
  avance: "AVANCE",
  decision: "DECISION",
  bloqueo: "BLOQUEO",
  llamada: "LLAMADA",
  reunion: "REUNION",
  mensaje: "MENSAJE",
  estado: "ESTADO",
};

const PRIORIDADES: Record<string, TaskPriority> = {
  alta: "ALTA",
  urgente: "ALTA",
  media: "MEDIA",
  normal: "MEDIA",
  baja: "BAJA",
};

/** El tipo de evidencia por las palabras con que se describe. */
function tipoDeOrigen(texto: string): SourceKind | null {
  const t = normalizeName(texto);
  if (/\bllamad/.test(t)) return "LLAMADA";
  if (/\breunion|\bjunta\b|\bvideollamada/.test(t)) return "REUNION";
  if (/\bmensaje|\bchat\b|\bwhatsapp|\bgrupo\b|\bcorreo|\bemail/.test(t)) return "MENSAJE";
  if (/\bdictad|\baudio|\bnota de voz/.test(t)) return "DICTADO";
  if (/\bdocumento|\bpdf\b|\bcontrato|\barchivo|\bloi\b/.test(t)) return "DOCUMENTO";
  return null;
}

// ------------------------------------------------------------- cabecera

interface Cabecera {
  valores: Map<string, string>;
  /** Índice de la línea de cierre `---`. */
  fin: number;
  lineas: Map<string, number>;
}

function leerCabecera(lineas: string[]): Cabecera | null {
  if (lineas[0]?.trim() !== "---") return null;
  const fin = lineas.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (fin < 0) return null;
  const valores = new Map<string, string>();
  const numeros = new Map<string, number>();
  for (let i = 1; i < fin; i += 1) {
    const m = lineas[i].match(/^\s*([^:#]+?)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = clave(m[1]);
    // Un comentario al final («estado: en marcha   # idea | …») no es del valor.
    const v = m[2].replace(/\s+#\s.*$/, "").trim().replace(/^["'](.*)["']$/, "$1");
    valores.set(k, v);
    numeros.set(k, i + 1);
  }
  return { valores, fin, lineas: numeros };
}

function leerLista(valor: string): string[] {
  const t = valor.trim().replace(/^\[(.*)\]$/, "$1");
  return t
    .split(",")
    .map((s) => s.trim().replace(/^["'](.*)["']$/, "$1").trim())
    .filter((s) => s !== "");
}

// -------------------------------------------------------------- secciones

type Seccion =
  | "como-va"
  | "objetivo"
  | "ficha"
  | "personas"
  | "frentes"
  | "ruta"
  | "tareas"
  | "recordatorios"
  | "bitacora"
  | "enlaces"
  | "fuentes"
  | "estado";

function seccionDe(titulo: string): Seccion | null {
  const t = clave(titulo);
  if (/^como va/.test(t)) return "como-va";
  if (/^objetivo/.test(t)) return "objetivo";
  if (/^ficha/.test(t)) return "ficha";
  if (/^(personas|gente|quien es quien|equipo)/.test(t)) return "personas";
  if (/^frentes?/.test(t)) return "frentes";
  if (/^(hoja de ruta|ruta|etapas|hitos)/.test(t)) return "ruta";
  if (/^(tareas|to do|todo|pendientes)/.test(t)) return "tareas";
  if (/^recordatorios?/.test(t)) return "recordatorios";
  if (/^bitacora/.test(t)) return "bitacora";
  if (/^(enlaces|documentos|links)/.test(t)) return "enlaces";
  if (/^fuentes/.test(t)) return "fuentes";
  if (/^estado/.test(t)) return "estado";
  return null;
}

interface Linea {
  n: number;
  texto: string;
}

interface Item {
  n: number;
  sangria: number;
  texto: string;
}

/**
 * Los elementos de una lista, con las líneas que siguen pegadas.
 *
 * Claude parte las líneas largas con una sangría; una línea con sangría que
 * no empieza por «- » es la continuación de la anterior, no algo nuevo.
 */
function items(lineas: Linea[]): { items: Item[]; sueltas: Linea[] } {
  const lista: Item[] = [];
  const sueltas: Linea[] = [];
  for (const linea of lineas) {
    if (linea.texto.trim() === "") continue;
    const m = linea.texto.match(/^(\s*)[-*+]\s+(.*)$/);
    if (m) {
      lista.push({ n: linea.n, sangria: m[1].replace(/\t/g, "  ").length, texto: m[2] });
    } else if (/^\s+\S/.test(linea.texto) && lista.length > 0) {
      lista[lista.length - 1].texto += ` ${linea.texto.trim()}`;
    } else {
      sueltas.push(linea);
    }
  }
  return { items: lista, sueltas };
}

/** `[ ]`, `[~]`, `[x]`, `[-]` o `[!]` al principio. */
function casilla(texto: string): { marca: string | null; resto: string } {
  const m = texto.match(/^\[([ xX~\-!])\]\s*(.*)$/);
  return m ? { marca: m[1].toLowerCase(), resto: m[2] } : { marca: null, resto: texto };
}

function parrafo(lineas: Linea[]): string | null {
  const texto = lineas
    .map((l) => l.texto.replace(/^\s*[-*+]\s+/, "").trim())
    .filter((t) => t !== "" && !esFalta(t))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texto === "" ? null : texto;
}

// ------------------------------------------------------------------ lector

/**
 * Lee el archivo de un proyecto.
 *
 * No toca la red ni la base: devuelve lo que entendió y los avisos de lo que
 * no. Quien llama enseña eso antes de crear nada.
 */
export function leerArchivoProyecto(texto: string, opciones: OpcionesLectura = {}): Lectura {
  const nuevoId = opciones.nuevoId ?? (() => uuidv7());
  const hoy = opciones.hoy ?? new Date().toISOString().slice(0, 10);

  if (texto.length > ARCHIVO_MAX_CARACTERES) {
    return { ok: false, error: "El archivo es demasiado grande para ser un proyecto." };
  }
  if (esArchivoPrivado(texto, opciones.nombreArchivo)) {
    return {
      ok: false,
      error: "Ese es el archivo privado del proyecto: nunca sube a la app. Elige el otro, el que no dice «privado».",
    };
  }

  // Los ids de los comentarios se guardan como fichas antes de quitar los
  // demás comentarios, que pueden ocupar varias líneas. Los saltos de línea de
  // un comentario se conservan para que los números de línea sigan siendo los
  // del archivo.
  const limpio = texto
    .replace(/\r\n?/g, "\n")
    .replace(/<!--\s*(id|p|f|e|h|t|b|l):([0-9a-f-]{36})\s*-->/gi, (_m, p: string, id: string) => `⟦${p.toLowerCase()}:${id}⟧`)
    .replace(/<!--[\s\S]*?-->/g, (comentario) => comentario.replace(/[^\n]/g, ""));
  const lineas = limpio.split("\n");

  const avisos: Aviso[] = [];
  let faltan = 0;

  const archivo: ArchivoProyecto = {
    ref: null,
    nuevoId: nuevoId(),
    nombre: "",
    slug: null,
    alias: [],
    estado: null,
    nube: null,
    objetivo: null,
    inicio: null,
    meta: null,
    color: null,
    icono: null,
    comoVa: null,
    ficha: null,
    personas: [],
    frentes: [],
    etapas: [],
    hitos: [],
    tareas: [],
    recordatorios: [],
    bitacora: [],
    enlaces: [],
    avisos,
    faltan: 0,
  };

  // ------------------------------------------------------------ cabecera
  const cabecera = leerCabecera(lineas);
  let desde = 0;
  if (cabecera) {
    desde = cabecera.fin + 1;
    const v = (k: string) => {
      const valor = cabecera.valores.get(k);
      if (valor === undefined) return null;
      const sinFichas = limpiarTokens(valor);
      if (sinFichas === "" || esFalta(sinFichas)) {
        if (esFalta(sinFichas)) faltan += 1;
        return null;
      }
      return sinFichas;
    };
    const linea = (k: string) => cabecera.lineas.get(k) ?? null;

    archivo.nombre = v("proyecto") ?? v("nombre") ?? "";
    const slug = v("slug");
    if (slug !== null) {
      if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= PROJECT_LIMITS.slug) archivo.slug = slug;
      else avisos.push({ linea: linea("slug"), texto: `El slug «${slug}» no vale (minúsculas, números y guiones): lo saco del nombre.` });
    }
    const alias = v("alias") ?? v("aliases");
    if (alias !== null) archivo.alias = leerLista(alias).slice(0, 20);
    const estado = v("estado");
    if (estado !== null) {
      archivo.estado = ESTADOS[clave(estado)] ?? null;
      if (archivo.estado === null) avisos.push({ linea: linea("estado"), texto: `No conozco el estado «${estado}».` });
    }
    const nube = v("nube");
    if (nube !== null) {
      archivo.nube = NUBES[clave(nube)] ?? null;
      if (archivo.nube === null) avisos.push({ linea: linea("nube"), texto: `No conozco el nivel de nube «${nube}».` });
    }
    archivo.objetivo = recortar(v("objetivo"), PROJECT_LIMITS.objective, avisos, linea("objetivo"), "El objetivo");
    for (const [k, campo] of [
      ["inicio", "inicio"],
      ["meta", "meta"],
    ] as const) {
      const f = v(k);
      if (f === null) continue;
      const leida = leerFecha(f, hoy);
      if (leida) archivo[campo] = campo === "inicio" ? leida.desde : leida.fecha;
      else avisos.push({ linea: linea(k), texto: `La fecha de ${k} «${f}» no la entiendo (usa 2026-10-15).` });
    }
    const color = v("color");
    if (color !== null) {
      archivo.color = COLORES[clave(color)] ?? null;
      if (archivo.color === null) avisos.push({ linea: linea("color"), texto: `No conozco el color «${color}».` });
    }
    const icono = v("icono") ?? v("icon");
    if (icono !== null) archivo.icono = icono.slice(0, 8);
    const id = cabecera.valores.get("id")?.trim() ?? "";
    if (UUID.test(id)) archivo.ref = id.toLowerCase();
  }

  // ----------------------------------------------- secciones y su texto
  const porSeccion = new Map<Seccion, Linea[]>();
  let actual: Seccion | null = null;
  let ignorando = false;

  for (let i = desde; i < lineas.length; i += 1) {
    const texto = lineas[i];
    const n = i + 1;
    const h1 = texto.match(/^#\s+(.*)$/);
    if (h1) {
      if (archivo.nombre === "") {
        archivo.nombre = limpiarTokens(h1[1]).replace(/^proyecto\s*:\s*/i, "").trim();
      }
      actual = null;
      ignorando = false;
      continue;
    }
    const h2 = texto.match(/^##\s+(.*)$/);
    if (h2) {
      const titulo = limpiarTokens(h2[1]);
      actual = seccionDe(titulo);
      ignorando = actual === null;
      if (actual === null) avisos.push({ linea: n, texto: `No sé leer la sección «${titulo}»: la salto.` });
      else if (!porSeccion.has(actual)) porSeccion.set(actual, []);
      continue;
    }
    if (actual !== null && !ignorando) porSeccion.get(actual)?.push({ n, texto });
  }

  archivo.nombre = archivo.nombre.trim();
  if (archivo.nombre.length > PROJECT_NAME_MAX) {
    avisos.push({ linea: null, texto: `El nombre pasa de ${PROJECT_NAME_MAX} caracteres: lo corto.` });
    archivo.nombre = archivo.nombre.slice(0, PROJECT_NAME_MAX).trim();
  }
  if (archivo.nombre === "") {
    return { ok: false, error: "No encuentro el nombre del proyecto: falta «proyecto: …» arriba del todo." };
  }

  // ---------------------------------------------------------- estado (borrador)
  for (const item of items(porSeccion.get("estado") ?? []).items) {
    const m = sinNegritas(item.texto).match(/^([^:]+):\s*(.*)$/);
    const k = m ? clave(m[1]) : "";
    const valor = m ? m[2].trim() : "";
    if (k === "como va" && archivo.comoVa === null && !esFalta(valor)) {
      archivo.comoVa = valor;
    } else if (k === "estado" && archivo.estado === null) {
      archivo.estado = ESTADOS[clave(valor)] ?? null;
    } else if (k === "semaforo") {
      avisos.push({ linea: item.n, texto: "El semáforo lo calcula la app: si quieres fijarlo, hazlo allí." });
    } else {
      avisos.push({ linea: item.n, texto: "No sé qué hacer con esta línea del estado: la salto." });
    }
  }

  // ---------------------------------------------------------- textos
  const comoVa = parrafo(porSeccion.get("como-va") ?? []);
  if (comoVa !== null) archivo.comoVa = comoVa;
  archivo.comoVa = recortar(archivo.comoVa, PROJECT_LIMITS.how, avisos, null, "«Cómo va»");

  if (archivo.objetivo === null) {
    const objetivo = parrafo(porSeccion.get("objetivo") ?? []);
    archivo.objetivo = recortar(objetivo, PROJECT_LIMITS.objective, avisos, null, "El objetivo");
  }
  for (const linea of [...(porSeccion.get("objetivo") ?? []), ...(porSeccion.get("como-va") ?? [])]) {
    if (esFalta(linea.texto.replace(/^\s*[-*+]\s+/, ""))) faltan += 1;
  }

  const ficha = (porSeccion.get("ficha") ?? []).map((l) => limpiarTokens(l.texto)).join("\n").trim();
  if (ficha !== "" && esFalta(ficha) && !ficha.includes("\n")) faltan += 1;
  else if (ficha !== "") archivo.ficha = recortar(ficha, PROJECT_LIMITS.docBody, avisos, null, "La ficha técnica");

  // ---------------------------------------------------------- personas
  leerPersonas(porSeccion.get("personas") ?? [], archivo, nuevoId, avisos, () => (faltan += 1));

  // ---------------------------------------------------------- frentes
  for (const item of items(porSeccion.get("frentes") ?? []).items) {
    for (const parte of item.texto.split(/\s*·\s*/)) {
      const { texto: sinId, ref } = sacarId(parte, "f");
      const m = sinNegritas(sinId).match(/^(.*?)\s*(?:\(([^)]*)\))?\s*$/);
      const nombre = (m?.[1] ?? "").trim();
      if (nombre === "" || esFalta(nombre)) {
        if (esFalta(nombre)) faltan += 1;
        continue;
      }
      const responsable = m?.[2]?.trim() || null;
      archivo.frentes.push({
        ref,
        nuevoId: nuevoId(),
        nombre: nombre.slice(0, PROJECT_LIMITS.streamName),
        responsable: responsable && !esFalta(responsable) ? responsable.replace(/^@/, "") : null,
        linea: item.n,
      });
    }
  }

  // ---------------------------------------------------------- hoja de ruta
  leerRuta(porSeccion.get("ruta") ?? [], archivo, nuevoId, hoy, avisos, () => (faltan += 1));

  // ---------------------------------------------------------- tareas
  leerTareas(porSeccion.get("tareas") ?? [], archivo, nuevoId, hoy, avisos, () => (faltan += 1));

  // ---------------------------------------------------------- recordatorios
  for (const item of items(porSeccion.get("recordatorios") ?? []).items) {
    const t = limpiarTokens(item.texto);
    if (t !== "" && !esFalta(t)) archivo.recordatorios.push(t.slice(0, 200));
  }

  // ---------------------------------------------------------- bitácora
  for (const item of items(porSeccion.get("bitacora") ?? []).items) {
    const { texto: sinId, ref } = sacarId(item.texto, "b");
    let partes = segmentos(sinNegritas(sinId));
    if (partes.length === 0) continue;
    // «05/10/2026: texto» también vale.
    const conDosPuntos = partes[0].match(/^(\S+?)\s*:\s+(.*)$/);
    if (conDosPuntos && leerFecha(conDosPuntos[1], hoy)) partes = [conDosPuntos[1], conDosPuntos[2], ...partes.slice(1)];
    const fecha = leerFecha(partes[0], hoy);
    if (fecha) partes = partes.slice(1);
    else avisos.push({ linea: item.n, texto: "Una entrada de la bitácora sin fecha: le pongo la de hoy." });
    let tipo: LogKind = "NOTA";
    if (partes.length > 1 && TIPOS_BITACORA[clave(partes[0])]) {
      tipo = TIPOS_BITACORA[clave(partes[0])];
      partes = partes.slice(1);
    }
    const texto = partes.join(" — ").trim();
    if (texto === "" || esFalta(texto)) {
      if (esFalta(texto)) faltan += 1;
      continue;
    }
    archivo.bitacora.push({
      ref,
      nuevoId: nuevoId(),
      fecha: fecha?.fecha ?? hoy,
      tipo,
      texto: texto.slice(0, PROJECT_LIMITS.logBody),
      linea: item.n,
    });
  }

  // ---------------------------------------------------------- enlaces
  leerEnlaces(porSeccion.get("enlaces") ?? [], false, archivo, nuevoId, avisos);
  leerEnlaces(porSeccion.get("fuentes") ?? [], true, archivo, nuevoId, avisos);

  // ---------------------------------------------------------- topes
  for (const [lista, max, que] of [
    [archivo.personas, LIMITES_ARCHIVO.personas, "personas"],
    [archivo.frentes, LIMITES_ARCHIVO.frentes, "frentes"],
    [archivo.etapas, LIMITES_ARCHIVO.etapas, "etapas"],
    [archivo.hitos, LIMITES_ARCHIVO.hitos, "hitos"],
    [archivo.tareas, LIMITES_ARCHIVO.tareas, "tareas"],
    [archivo.bitacora, LIMITES_ARCHIVO.bitacora, "entradas de bitácora"],
    [archivo.enlaces, LIMITES_ARCHIVO.enlaces, "enlaces"],
    [archivo.recordatorios, LIMITES_ARCHIVO.recordatorios, "recordatorios"],
  ] as const) {
    if (lista.length > max) {
      return { ok: false, error: `Demasiadas ${que} (${lista.length}; como mucho ${max}).` };
    }
  }

  archivo.faltan = faltan;
  // Los avisos citan trozos del archivo: se cortan para que ninguno sea un
  // párrafo, y como mucho doscientos.
  archivo.avisos = avisos.slice(0, 200).map((a) => ({ linea: a.linea, texto: a.texto.slice(0, 280) }));
  return { ok: true, archivo };
}

// ------------------------------------------------------------- personas

type Columna = "nombre" | "papel" | "lado" | "hace" | "whatsapp" | "nota" | "relacion" | "alias";

const COLUMNAS: Record<string, Columna> = {
  persona: "nombre",
  nombre: "nombre",
  quien: "nombre",
  papel: "papel",
  rol: "papel",
  cargo: "papel",
  lado: "lado",
  "que hace": "hace",
  hace: "hace",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  alias: "alias",
  "como le digo": "alias",
  apodo: "alias",
  nota: "nota",
  notas: "nota",
  relacion: "relacion",
  "quien es": "relacion",
};

function celdas(linea: string): string[] {
  const t = linea.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

function whatsappDe(texto: string): "SI" | "NO" | null {
  const t = clave(texto);
  if (/^(si|yes|✓)/.test(t) || texto.trim().startsWith("✓")) return "SI";
  if (/^no\b/.test(t) || texto.trim().startsWith("✗")) return "NO";
  return null;
}

function leerPersonas(
  lineas: Linea[],
  archivo: ArchivoProyecto,
  nuevoId: () => string,
  avisos: Aviso[],
  falta: () => void,
): void {
  const vistos = new Set<string>();
  const anadir = (p: Omit<PersonaArchivo, "nuevoId">) => {
    const k = p.esYo ? "yo" : normalizeName(p.nombre);
    if (vistos.has(k)) {
      avisos.push({ linea: p.linea, texto: `«${p.nombre}» sale dos veces en Personas: me quedo con la primera.` });
      return;
    }
    vistos.add(k);
    archivo.personas.push({ ...p, nuevoId: nuevoId() });
  };

  const tabla = lineas.filter((l) => l.texto.trim().startsWith("|"));
  if (tabla.length >= 2) {
    const cabecera: (Columna | null)[] = celdas(tabla[0].texto).map((c) => COLUMNAS[clave(c)] ?? null);
    if (!cabecera.includes("nombre")) {
      avisos.push({ linea: tabla[0].n, texto: "La tabla de personas no tiene columna «Persona»: la salto." });
    } else {
      for (const fila of tabla.slice(1)) {
        if (/^\|?\s*:?-{2,}/.test(fila.texto.trim())) continue;
        const { texto: sinId, ref } = sacarId(fila.texto, "p");
        const valores = celdas(sinId);
        const dato = (campo: Columna) => {
          const i = cabecera.indexOf(campo);
          const v = i >= 0 ? sinNegritas(valores[i] ?? "") : "";
          if (esFalta(v)) {
            falta();
            return null;
          }
          return v === "" || v === "—" || v === "-" ? null : v;
        };
        const crudo = dato("nombre");
        if (crudo === null) continue;
        const marcaYo = /\((yo|tú|tu)\)/i.test(crudo);
        const nombre = crudo.replace(/\((yo|tú|tu)\)/i, "").trim();
        const esYo = marcaYo || isMe(nombre);
        const ladoTexto = dato("lado");
        const lado = ladoTexto ? (LADOS[clave(ladoTexto)] ?? null) : null;
        if (ladoTexto && !lado) avisos.push({ linea: fila.n, texto: `No conozco el lado «${ladoTexto}».` });
        const wa = valores[cabecera.indexOf("whatsapp")] ?? "";
        anadir({
          ref,
          nombre: esYo ? "Yo" : nombre.slice(0, 80),
          esYo,
          alias: (dato("alias") ?? "").split(/[,;]/).map((a) => a.trim()).filter(Boolean).slice(0, 10),
          relacion: recortar(dato("relacion"), 120, avisos, fila.n, "La relación"),
          papel: recortar(dato("papel"), PROJECT_LIMITS.memberRole, avisos, fila.n, "El papel"),
          lado,
          hace: recortar(dato("hace"), PROJECT_LIMITS.memberDoes, avisos, fila.n, "«Qué hace»"),
          whatsapp: esYo || cabecera.indexOf("whatsapp") < 0 ? null : whatsappDe(wa),
          nota: recortar(dato("nota"), 1000, avisos, fila.n, "La nota"),
          linea: fila.n,
        });
      }
    }
  }

  // También como lista: «- **Ana** (yo) — papel — qué hace».
  for (const item of items(lineas.filter((l) => !l.texto.trim().startsWith("|"))).items) {
    const { texto: sinId, ref } = sacarId(item.texto, "p");
    const partes = segmentos(sinNegritas(sinId));
    if (partes.length === 0) continue;
    const cabeza = partes[0].match(/^(.*?)\s*(?:\((.*)\))?$/);
    const nombre = (cabeza?.[1] ?? partes[0]).trim();
    const entreParentesis = cabeza?.[2]?.trim() ?? "";
    if (nombre === "" || esFalta(nombre)) continue;
    const esYo = /^(yo|tú|tu)$/i.test(entreParentesis) || isMe(nombre);
    const resto = partes.slice(1).map((p) => {
      if (esFalta(p)) {
        falta();
        return null;
      }
      return p.replace(/\s*\(falta[^)]*\)\s*/gi, " ").trim() || null;
    });
    const segundo = resto[0] ?? null;
    anadir({
      ref,
      nombre: esYo ? "Yo" : nombre.slice(0, 80),
      esYo,
      alias: [],
      relacion: segundo !== null && segundo.length > 40 ? segundo.slice(0, 120) : null,
      papel: segundo !== null && segundo.length <= 40 ? segundo : null,
      lado: null,
      hace: recortar(resto[1] ?? null, PROJECT_LIMITS.memberDoes, avisos, item.n, "«Qué hace»"),
      whatsapp: null,
      nota: !esYo && entreParentesis !== "" ? entreParentesis.slice(0, 1000) : null,
      linea: item.n,
    });
  }
}

// ------------------------------------------------------------- hoja de ruta

const MARCA_HITO: Record<string, MilestoneStatus> = {
  " ": "PENDIENTE",
  "~": "EN_CURSO",
  x: "HECHO",
  "-": "SALTADO",
  "!": "BLOQUEADO",
};

function leerRuta(
  lineas: Linea[],
  archivo: ArchivoProyecto,
  nuevoId: () => string,
  hoy: string,
  avisos: Aviso[],
  falta: () => void,
): void {
  let etapa: number | null = null;
  const bloque: Linea[] = [];

  const vaciar = () => {
    for (const item of items(bloque).items) {
      const { texto: sinId, ref } = sacarId(item.texto, "h");
      const { marca, resto } = casilla(sinNegritas(sinId));
      const partes = segmentos(resto);
      if (partes.length === 0) continue;
      const titulo = partes[0];
      if (esFalta(titulo)) {
        falta();
        continue;
      }
      let fecha: FechaLeida | null = null;
      let responsable: string | null = null;
      const detalle: string[] = [];
      for (const parte of partes.slice(1)) {
        const f = leerFecha(parte, hoy);
        if (f && fecha === null) fecha = f;
        else if (parte.startsWith("@")) responsable = parte.slice(1).trim();
        else if (esFalta(parte)) falta();
        else detalle.push(parte);
      }
      archivo.hitos.push({
        ref,
        nuevoId: nuevoId(),
        titulo: titulo.slice(0, PROJECT_LIMITS.milestoneTitle),
        fecha: fecha?.fecha ?? null,
        precision: fecha?.precision ?? "DIA",
        estado: MARCA_HITO[marca ?? " "] ?? "PENDIENTE",
        responsable,
        etapa,
        detalle: detalle.length > 0 ? detalle.join(" · ").slice(0, PROJECT_LIMITS.milestoneDetail) : null,
        linea: item.n,
      });
    }
    bloque.length = 0;
  };

  for (const linea of lineas) {
    const h3 = linea.texto.match(/^###\s+(.*)$/);
    if (!h3) {
      bloque.push(linea);
      continue;
    }
    vaciar();
    const { texto: sinId, ref } = sacarId(h3[1], "e");
    let titulo = sinNegritas(sinId);
    let inicio: string | null = null;
    let fin: string | null = null;
    const fechas = titulo.match(/\(([^()]*)\)\s*$/);
    if (fechas) {
      const [a, b] = fechas[1].split(/\s*(?:→|->|–|—|\ba\b)\s*/);
      const fa = a ? leerFecha(a, hoy) : null;
      const fb = b ? leerFecha(b, hoy) : null;
      if (fa) {
        inicio = fa.desde;
        fin = fb ? fb.fecha : fa.precision === "MES" ? fa.fecha : null;
        titulo = titulo.slice(0, fechas.index).trim();
      }
    }
    titulo = titulo.replace(/^etapa\s*\d+\s*[—–:.\-]?\s*/i, "").trim() || `Etapa ${archivo.etapas.length + 1}`;
    archivo.etapas.push({
      ref,
      nuevoId: nuevoId(),
      titulo: titulo.slice(0, PROJECT_LIMITS.milestoneTitle),
      inicio,
      fin,
      linea: linea.n,
    });
    etapa = archivo.etapas.length - 1;
  }
  vaciar();
}

// ------------------------------------------------------------------ tareas

const MARCA_TAREA: Record<string, TaskStatus> = {
  " ": "NO_INICIADA",
  "~": "EN_CURSO",
  x: "HECHA",
};

function leerTareas(
  lineas: Linea[],
  archivo: ArchivoProyecto,
  nuevoId: () => string,
  hoy: string,
  avisos: Aviso[],
  falta: () => void,
): void {
  let madre: number | null = null;
  const nombres = archivo.personas.flatMap((p) => [p.nombre, ...p.alias]).map(normalizeName);

  for (const item of items(lineas).items) {
    const { texto: sinId, ref } = sacarId(item.texto, "t");
    const { marca, resto } = casilla(sinNegritas(sinId));
    const partes = segmentos(resto);
    if (partes.length === 0) continue;
    let titulo = partes[0];
    if (esFalta(titulo)) {
      falta();
      continue;
    }
    if (marca === "!") avisos.push({ linea: item.n, texto: "Una tarea no se marca como bloqueada: la dejo pendiente." });

    let responsable: string | null = null;
    let fecha: string | null = null;
    let frente: string | null = null;
    let prioridad: TaskPriority | null = null;
    let origen: OrigenArchivo | null = null;
    const notas: string[] = [];

    for (const parte of partes.slice(1)) {
      const f = leerFecha(parte, hoy);
      if (parte.startsWith("@") && responsable === null) responsable = parte.slice(1).trim();
      else if (f && fecha === null) {
        fecha = f.fecha;
        if (f.precision === "MES") avisos.push({ linea: item.n, texto: `«${titulo}» vence en un mes sin día: le pongo el último.` });
      } else if (parte.startsWith("#") && frente === null) frente = parte.slice(1).trim();
      else if (/^!\s*\S/.test(parte) && PRIORIDADES[clave(parte.slice(1))]) prioridad = PRIORIDADES[clave(parte.slice(1))];
      else if (/^prioridad\s*:/i.test(parte) && PRIORIDADES[clave(parte.replace(/^prioridad\s*:/i, ""))]) {
        prioridad = PRIORIDADES[clave(parte.replace(/^prioridad\s*:/i, ""))];
      } else if (/^\(.*\)$/.test(parte) || /^(origen|de|salio de|salió de)\s*:/i.test(parte)) {
        const t = parte.replace(/^\((.*)\)$/, "$1").replace(/^(origen|de|salio de|salió de)\s*:\s*/i, "").trim();
        if (t !== "") origen = { tipo: tipoDeOrigen(t), texto: t.slice(0, PROJECT_LIMITS.sourceLabelTask) };
      } else if (esFalta(parte)) falta();
      else notas.push(parte);
    }

    // «Ana: mandar el plano» con Ana en Personas es una tarea de Ana.
    if (responsable === null) {
      const m = titulo.match(/^([^:]{1,40}):\s+(.+)$/);
      if (m && (isMe(m[1]) || nombres.includes(normalizeName(m[1])))) {
        responsable = m[1].trim();
        titulo = m[2].trim();
      }
    }
    if (responsable !== null && isMe(responsable)) responsable = "yo";

    const esSubtarea = item.sangria >= 2 && madre !== null;
    if (item.sangria >= 4 && madre !== null) {
      avisos.push({ linea: item.n, texto: "Las subtareas tienen un solo nivel: la cuelgo de la tarea de arriba." });
    }
    if (notas.length > 0) avisos.push({ linea: item.n, texto: `No sé dónde va «${notas.join(" — ")}»: lo dejo en la nota de la tarea.` });

    archivo.tareas.push({
      ref,
      nuevoId: nuevoId(),
      titulo: titulo.slice(0, PROJECT_LIMITS.taskTitle),
      estado: MARCA_TAREA[marca ?? " "] ?? "NO_INICIADA",
      quitar: marca === "-",
      responsable,
      fecha,
      frente,
      prioridad,
      origen,
      notas: notas.length > 0 ? notas.join(" — ").slice(0, 4000) : null,
      padre: esSubtarea ? madre : null,
      linea: item.n,
    });
    if (!esSubtarea) madre = archivo.tareas.length - 1;
  }
}

// ----------------------------------------------------------------- enlaces

function leerEnlaces(
  lineas: Linea[],
  soloDocumentos: boolean,
  archivo: ArchivoProyecto,
  nuevoId: () => string,
  avisos: Aviso[],
): void {
  for (const item of items(lineas).items) {
    const { texto: sinId, ref } = sacarId(item.texto, "l");
    const texto = sinNegritas(sinId);
    if (esFalta(texto)) continue;
    const markdown = texto.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    const url = markdown?.[2] ?? texto.match(/https?:\/\/\S+/)?.[0]?.replace(/[)>.,;]+$/, "") ?? null;
    let etiqueta = markdown?.[1] ?? segmentos(texto.replace(url ?? "\u0000", "")).filter(Boolean)[0] ?? "";
    etiqueta = etiqueta.replace(/^documento\s*:\s*/i, "").replace(/[«»"]/g, "").replace(/\s*:$/, "").trim();
    const enMac = url === null;
    if (soloDocumentos && url === null && !/^documento\s*:/i.test(texto)) {
      avisos.push({ linea: item.n, texto: "Las llamadas y los chats los enlazará el bot, no el archivo: salto esta línea." });
      continue;
    }
    if (enMac) etiqueta = etiqueta.replace(/\s*\((en la mac|en mi mac)\)\s*$/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
    if (etiqueta === "") etiqueta = url ?? "";
    if (etiqueta === "") continue;
    if (url !== null && url.length > PROJECT_LIMITS.sourceRef) {
      avisos.push({ linea: item.n, texto: "Ese enlace es demasiado largo: lo salto." });
      continue;
    }
    archivo.enlaces.push({
      ref,
      nuevoId: nuevoId(),
      etiqueta: etiqueta.slice(0, PROJECT_LIMITS.sourceLabel),
      url,
      enMac,
      linea: item.n,
    });
  }
}

// ----------------------------------------------------------------- escritor

export interface PersonaParaEscribir {
  id: string;
  nombre: string;
  esYo: boolean;
  alias: string[];
  relacion: string | null;
  papel: string | null;
  lado: MemberSide | null;
  hace: string | null;
  whatsapp: "SI" | "NO" | null;
  nota: string | null;
}

export interface HitoParaEscribir {
  id: string;
  titulo: string;
  fecha: string | null;
  precision: DuePrecision;
  estado: MilestoneStatus;
  responsable: string | null;
}

export interface TareaParaEscribir {
  id: string;
  titulo: string;
  estado: TaskStatus;
  responsable: string | null;
  fecha: string | null;
  frente: string | null;
  prioridad: TaskPriority;
  origen: string | null;
  subtareas: Omit<TareaParaEscribir, "subtareas">[];
}

export interface ArchivoParaEscribir {
  id: string;
  nombre: string;
  slug: string | null;
  alias: string[];
  estado: ProjectStatus;
  objetivo: string | null;
  inicio: string | null;
  meta: string | null;
  color: ProjectColor | null;
  icono: string | null;
  comoVa: string | null;
  ficha: string | null;
  personas: PersonaParaEscribir[];
  frentes: { id: string; nombre: string; responsable: string | null }[];
  etapas: { id: string; titulo: string; inicio: string | null; fin: string | null; hitos: HitoParaEscribir[] }[];
  hitosSueltos: HitoParaEscribir[];
  tareas: TareaParaEscribir[];
  bitacora: { id: string; fecha: string; tipo: LogKind; texto: string }[];
  enlaces: { id: string; etiqueta: string; url: string | null; enMac: boolean }[];
  /** Cuándo se exportó, para la cabecera. `YYYY-MM-DD`. */
  hoy: string;
}

const ESTADO_TEXTO: Record<ProjectStatus, string> = {
  IDEA: "idea",
  EN_MARCHA: "en marcha",
  ESPERANDO: "esperando",
  ATASCADO: "atascado",
  EN_PAUSA: "en pausa",
  TERMINADO: "terminado",
  DESCARTADO: "descartado",
};

const LADO_TEXTO: Record<MemberSide, string> = {
  NOSOTROS: "nosotros",
  CONTRAPARTE: "contraparte",
  ASESOR: "asesor",
  OTRO: "otro",
};

const TIPO_TEXTO: Record<LogKind, string> = {
  NOTA: "nota",
  AVANCE: "avance",
  DECISION: "decisión",
  BLOQUEO: "bloqueo",
  LLAMADA: "llamada",
  REUNION: "reunión",
  MENSAJE: "mensaje",
  ESTADO: "estado",
};

const MARCA_DE_HITO: Record<MilestoneStatus, string> = {
  PENDIENTE: " ",
  EN_CURSO: "~",
  HECHO: "x",
  SALTADO: "-",
  BLOQUEADO: "!",
};

const MARCA_DE_TAREA: Record<TaskStatus, string> = {
  NO_INICIADA: " ",
  EN_CURSO: "~",
  HECHA: "x",
};

/** Un texto en una línea, sin lo que el lector tomaría por separador. */
function enLinea(texto: string): string {
  return texto.replace(/\s+/g, " ").replace(/\s+[—–]\s+|\s+--\s+/g, " - ").replace(/<!--|-->/g, "").trim();
}

function enCelda(texto: string | null): string {
  return texto === null ? "—" : enLinea(texto).replace(/\|/g, "/");
}

function mencion(nombre: string | null): string | null {
  return nombre === null ? null : `@${enLinea(nombre)}`;
}

function fechaDeHito(h: HitoParaEscribir): string | null {
  if (h.fecha === null) return null;
  return h.precision === "MES" ? h.fecha.slice(0, 7) : h.fecha;
}

/**
 * El proyecto como archivo, con los ids en comentarios.
 *
 * Es lo que devuelve «Exportar para Claude»: Claude lo lee, lo cambia y lo
 * devuelve, y al importarlo cada línea sabe qué fila es gracias a su id.
 */
export function escribirArchivoProyecto(d: ArchivoParaEscribir): string {
  const out: string[] = [];
  const front = (k: string, v: string | null) => {
    if (v !== null && v !== "") out.push(`${k}: ${enLinea(v)}`);
  };

  out.push("---");
  front("proyecto", d.nombre);
  front("slug", d.slug);
  if (d.alias.length > 0) out.push(`alias: [${d.alias.map(enLinea).join(", ")}]`);
  front("estado", ESTADO_TEXTO[d.estado]);
  out.push("nube: completa");
  front("objetivo", d.objetivo);
  front("inicio", d.inicio);
  front("meta", d.meta);
  if (d.color && d.color !== "default") front("color", d.color);
  front("icono", d.icono);
  out.push(`id: ${d.id}`);
  out.push(`exportado: ${d.hoy}`);
  out.push("---", "");

  out.push("## Cómo va", d.comoVa?.trim() || "(falta: cómo va, en una o dos frases)", "");

  // Un encabezado de primer o segundo nivel dentro de la ficha cortaría la
  // sección al volver a leerla: baja a tercer nivel.
  const ficha = d.ficha?.trim().replace(/^#{1,2}\s/gm, "### ");
  out.push("## Ficha técnica", ficha || "(falta)", "");

  out.push("## Personas");
  out.push("| Persona | Papel | Lado | Qué hace | WhatsApp | Relación | Alias | Nota |");
  out.push("|---|---|---|---|---|---|---|---|");
  for (const p of d.personas) {
    const nombre = p.esYo ? "Yo" : enCelda(p.nombre);
    const wa = p.esYo ? "—" : p.whatsapp === "SI" ? "sí" : p.whatsapp === "NO" ? "no" : "—";
    out.push(
      `| ${nombre} <!-- p:${p.id} --> | ${enCelda(p.papel)} | ${p.lado ? LADO_TEXTO[p.lado] : "—"} | ${enCelda(p.hace)} | ${wa} | ${enCelda(p.relacion)} | ${p.alias.length > 0 ? enCelda(p.alias.join(", ")) : "—"} | ${enCelda(p.nota)} |`,
    );
  }
  out.push("");

  out.push("## Frentes");
  for (const f of d.frentes) {
    out.push(`- ${enLinea(f.nombre).replace(/·/g, "-")}${f.responsable ? ` (${enLinea(f.responsable).replace(/[()]/g, "")})` : ""} <!-- f:${f.id} -->`);
  }
  out.push("");

  const lineaHito = (h: HitoParaEscribir) =>
    [`- [${MARCA_DE_HITO[h.estado]}] ${enLinea(h.titulo)}`, mencion(h.responsable), fechaDeHito(h)]
      .filter(Boolean)
      .join(" — ") + ` <!-- h:${h.id} -->`;

  out.push("## Hoja de ruta");
  for (const h of d.hitosSueltos) out.push(lineaHito(h));
  d.etapas.forEach((e, i) => {
    const fechas = e.inicio && e.fin ? ` (${e.inicio} → ${e.fin})` : e.inicio ? ` (${e.inicio})` : e.fin ? ` (${e.fin})` : "";
    out.push(`### Etapa ${i + 1} — ${enLinea(e.titulo)}${fechas} <!-- e:${e.id} -->`);
    for (const h of e.hitos) out.push(lineaHito(h));
  });
  out.push("");

  const lineaTarea = (t: Omit<TareaParaEscribir, "subtareas">, sangria: string) =>
    sangria +
    [
      `- [${MARCA_DE_TAREA[t.estado]}] ${enLinea(t.titulo)}`,
      mencion(t.responsable),
      t.fecha,
      t.frente ? `#${enLinea(t.frente)}` : null,
      t.prioridad !== "MEDIA" ? `!${t.prioridad.toLowerCase()}` : null,
      t.origen ? `(${enLinea(t.origen).replace(/[()]/g, "")})` : null,
    ]
      .filter(Boolean)
      .join(" — ") +
    ` <!-- t:${t.id} -->`;

  out.push("## Tareas");
  for (const t of d.tareas) {
    out.push(lineaTarea(t, ""));
    for (const s of t.subtareas) out.push(lineaTarea(s, "  "));
  }
  out.push("");

  out.push("## Bitácora");
  for (const b of d.bitacora) {
    out.push(`- ${b.fecha} — ${TIPO_TEXTO[b.tipo]} — ${enLinea(b.texto)} <!-- b:${b.id} -->`);
  }
  out.push("");

  out.push("## Enlaces");
  for (const l of d.enlaces) {
    out.push(
      l.url
        ? `- ${enLinea(l.etiqueta)} — ${l.url} <!-- l:${l.id} -->`
        : `- ${enLinea(l.etiqueta)} (en la Mac) <!-- l:${l.id} -->`,
    );
  }
  out.push("");

  return out.join("\n");
}

/** El nombre de archivo de un proyecto: `finca-el-roble.md`. */
export function nombreDeArchivo(slug: string | null, nombre: string): string {
  const base = (slug ?? nombre)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "proyecto"}.md`;
}
