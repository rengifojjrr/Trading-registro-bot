/**
 * Una base de mentira en memoria con la forma del cliente de Supabase que usa
 * el puente: `from(tabla)` con `select/insert/update/upsert/delete`, los
 * filtros `eq/gt/in/is`, `order`, `limit`, `maybeSingle`, `single` y `rpc`.
 *
 * Imita lo que importa a las pruebas: claves únicas (el `23505` de Postgres),
 * claves foráneas de las referencias del proyecto (`23503`), la versión que
 * sube un disparador y el feed que llenan los disparadores. No es Postgres:
 * las RLS y las claves compuestas las prueba `supabase/tests/puente.prueba.sql`.
 */

export type Fila = Record<string, unknown>;

interface ErrorFalso {
  code: string;
  message: string;
}

const UNICAS: Record<string, string[][]> = {
  tasks_projects: [["id"], ["user_id", "name"], ["user_id", "slug"], ["user_id", "ext_source", "ext_id"]],
  tasks_items: [["id"], ["user_id", "ext_source", "ext_id"]],
  core_people: [["id"], ["user_id", "ext_source", "ext_id"]],
  tasks_project_members: [["id"], ["project_id", "person_id"]],
  tasks_streams: [["id"], ["project_id", "name"]],
  tasks_milestones: [["id"], ["user_id", "ext_source", "ext_id"]],
  tasks_project_log: [["id"], ["user_id", "ext_source", "ext_id"]],
  tasks_project_docs: [["id"]],
  tasks_project_sources: [["id"], ["user_id", "ext_source", "ext_id"]],
  core_inbox: [["id"], ["user_id", "ext_source", "ext_id"]],
  puente_ops: [["op_id"]],
  puente_clientes: [["user_id", "cliente"]],
  puente_llaves: [["id"]],
  core_daily_metrics: [["user_id", "metric_date", "module", "metric_key"]],
};

/** Referencias que tienen que existir (las claves foráneas que miran las pruebas). */
const REFERENCIAS: Record<string, [string, string][]> = {
  tasks_items: [["project_id", "tasks_projects"], ["assignee_id", "core_people"], ["milestone_id", "tasks_milestones"]],
  tasks_project_members: [["project_id", "tasks_projects"], ["person_id", "core_people"]],
  tasks_streams: [["project_id", "tasks_projects"]],
  tasks_milestones: [["project_id", "tasks_projects"]],
  tasks_project_log: [["project_id", "tasks_projects"]],
  tasks_project_docs: [["project_id", "tasks_projects"]],
  tasks_project_sources: [["project_id", "tasks_projects"]],
  core_inbox: [["project_id", "tasks_projects"]],
};

const CON_VERSION = new Set([
  "tasks_projects", "tasks_items", "core_people", "tasks_project_members", "tasks_streams", "tasks_milestones",
  "tasks_project_log", "tasks_project_docs", "tasks_project_sources", "core_inbox",
]);

const ENTIDAD_DE: Record<string, string> = {
  tasks_projects: "proyecto",
  tasks_items: "tarea",
  core_people: "persona",
  tasks_project_members: "miembro",
  tasks_streams: "frente",
  tasks_milestones: "hito",
  tasks_project_log: "bitacora",
  tasks_project_docs: "doc",
  tasks_project_sources: "fuente",
  core_inbox: "propuesta",
};

const POR_DEFECTO: Record<string, Fila> = {
  tasks_projects: { aliases: [], status: "EN_MARCHA", field_src: {}, is_active: true, cloud_level: "COMPLETA" },
  tasks_items: { status: "NO_INICIADA", priority: "MEDIA", with_ids: [], field_src: {}, former_titles: [] },
  core_people: { aliases: [], is_owner: false, has_whatsapp: false, field_src: {} },
  tasks_project_members: { is_lead: false, active: true, field_src: {} },
  tasks_streams: { active: true, field_src: {} },
  tasks_milestones: { due_precision: "DIA", status: "PENDIENTE", field_src: {}, former_titles: [] },
  core_inbox: { status: "ABIERTA", confidence: "DUDOSA", alt_project_ids: [], payload: {} },
};

export interface BaseFalsa {
  tablas: Record<string, Fila[]>;
  /** Tablas que «no existen» (los recordatorios antes de su migración). */
  ausentes: Set<string>;
  nonces: Set<string>;
  /** Quién figura como autor de los cambios (la cabecera del puente). */
  por: string | null;
  /** Una base que devuelve todas las columnas aunque se pidan menos (para probar que se recorta igual). */
  devuelveDeMas: boolean;
  seq: number;
  from: (tabla: string) => Consulta;
  rpc: (nombre: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: ErrorFalso | null }>;
}

let contadorIds = 0;
const idNuevo = () => `00000000-0000-4000-8000-${String((contadorIds += 1)).padStart(12, "0")}`;

export function baseFalsa(inicial: Record<string, Fila[]> = {}): BaseFalsa {
  const base: BaseFalsa = {
    tablas: Object.fromEntries(Object.entries(inicial).map(([t, filas]) => [t, filas.map((f) => ({ ...f }))])),
    ausentes: new Set(),
    nonces: new Set(),
    por: null,
    devuelveDeMas: false,
    seq: 0,
    from: (tabla) => new Consulta(base, tabla),
    rpc: async (nombre, args) => {
      if (nombre !== "puente_usar_nonce") return { data: null, error: { code: "42883", message: "no existe" } };
      const clave = `${args.p_llave}:${args.p_nonce}`;
      if (base.nonces.has(clave)) return { data: false, error: null };
      base.nonces.add(clave);
      return { data: true, error: null };
    },
  };
  return base;
}

/** El feed, como lo llenarían los disparadores. */
function anotar(base: BaseFalsa, tabla: string, fila: Fila, op: "upsert" | "delete") {
  const entidad = ENTIDAD_DE[tabla];
  if (!entidad) return;
  base.seq += 1;
  (base.tablas.puente_cambios ??= []).push({
    seq: base.seq,
    user_id: fila.user_id,
    entidad,
    entidad_id: fila.id,
    op,
    version: op === "delete" ? null : (fila.version ?? null),
    por: base.por,
    cambiado_en: new Date(Date.UTC(2026, 9, 6, 12, 0, base.seq)).toISOString(),
  });
}

type Filtro = (f: Fila) => boolean;

class Consulta implements PromiseLike<{ data: unknown; error: ErrorFalso | null; count?: number | null }> {
  private filtros: Filtro[] = [];
  private accion: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private datos: unknown = null;
  private opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private columnas: string | null = null;
  private devolver = false;
  private orden: { columna: string; asc: boolean } | null = null;
  private tope: number | null = null;
  private contar = false;
  private soloCabecera = false;
  private uno: "maybe" | "single" | null = null;

  constructor(
    private base: BaseFalsa,
    private tabla: string,
  ) {}

  select(columnas = "*", opciones: { count?: string; head?: boolean } = {}) {
    if (this.accion === "select") {
      this.columnas = columnas;
      this.contar = !!opciones.count;
      this.soloCabecera = !!opciones.head;
    } else {
      this.devolver = true;
      this.columnas = columnas;
    }
    return this;
  }
  insert(filas: unknown) {
    this.accion = "insert";
    this.datos = filas;
    return this;
  }
  update(cambios: unknown) {
    this.accion = "update";
    this.datos = cambios;
    return this;
  }
  upsert(filas: unknown, opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.accion = "upsert";
    this.datos = filas;
    this.opciones = opciones;
    return this;
  }
  delete() {
    this.accion = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtros.push((f) => f[c] === v);
    return this;
  }
  gt(c: string, v: number) {
    this.filtros.push((f) => (f[c] as number) > v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filtros.push((f) => vs.includes(f[c]));
    return this;
  }
  is(c: string, v: null) {
    this.filtros.push((f) => (f[c] ?? null) === v);
    return this;
  }
  order(columna: string, opciones: { ascending?: boolean } = {}) {
    this.orden = { columna, asc: opciones.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.tope = n;
    return this;
  }
  maybeSingle() {
    this.uno = "maybe";
    return this;
  }
  single() {
    this.uno = "single";
    return this;
  }

  then<A = { data: unknown; error: ErrorFalso | null }, B = never>(
    ok?: ((r: { data: unknown; error: ErrorFalso | null; count?: number | null }) => A | PromiseLike<A>) | null,
    mal?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.ejecutar()).then(ok, mal);
  }

  private filas(): Fila[] {
    return (this.base.tablas[this.tabla] ??= []);
  }

  private recortar(f: Fila): Fila {
    if (!this.columnas || this.columnas.trim() === "*" || this.base.devuelveDeMas) return { ...f };
    const cols = this.columnas.split(",").map((c) => c.trim());
    return Object.fromEntries(cols.map((c) => [c, f[c] ?? null]));
  }

  private choca(f: Fila, ignorar?: Fila): ErrorFalso | null {
    for (const clave of UNICAS[this.tabla] ?? [["id"]]) {
      if (clave.some((c) => f[c] === null || f[c] === undefined)) continue;
      if (this.filas().some((x) => x !== ignorar && clave.every((c) => x[c] === f[c]))) {
        return { code: "23505", message: `duplicada ${clave.join(",")}` };
      }
    }
    return null;
  }

  private referencias(f: Fila): ErrorFalso | null {
    for (const [columna, destino] of REFERENCIAS[this.tabla] ?? []) {
      const v = f[columna];
      if (v === null || v === undefined) continue;
      const existe = (this.base.tablas[destino] ?? []).some((x) => x.id === v && x.user_id === f.user_id);
      if (!existe) return { code: "23503", message: `${columna} no existe` };
    }
    return null;
  }

  private resultado(lista: Fila[]): { data: unknown; error: ErrorFalso | null } {
    if (this.uno === "maybe") return { data: lista[0] ?? null, error: null };
    if (this.uno === "single") {
      return lista.length === 1 ? { data: lista[0], error: null } : { data: null, error: { code: "PGRST116", message: "no una" } };
    }
    return { data: lista, error: null };
  }

  private ejecutar(): { data: unknown; error: ErrorFalso | null; count?: number | null } {
    if (this.base.ausentes.has(this.tabla)) return { data: null, error: { code: "PGRST205", message: "no existe" } };
    const pasa = (f: Fila) => this.filtros.every((fn) => fn(f));

    if (this.accion === "select") {
      let lista = this.filas().filter(pasa);
      if (this.orden) {
        const { columna, asc } = this.orden;
        lista = [...lista].sort((a, b) => ((a[columna] as number) > (b[columna] as number) ? 1 : -1) * (asc ? 1 : -1));
      }
      if (this.tope !== null) lista = lista.slice(0, this.tope);
      if (this.contar) return { data: this.soloCabecera ? null : lista.map((f) => this.recortar(f)), error: null, count: lista.length };
      return this.resultado(lista.map((f) => this.recortar(f)));
    }

    if (this.accion === "insert" || this.accion === "upsert") {
      const filas = (Array.isArray(this.datos) ? this.datos : [this.datos]) as Fila[];
      const hechas: Fila[] = [];
      for (const entrada of filas) {
        const nueva: Fila = {
          ...(POR_DEFECTO[this.tabla] ?? {}),
          ...(this.tabla === "puente_ops" ? {} : { id: entrada.id ?? idNuevo() }),
          ...(CON_VERSION.has(this.tabla) ? { version: 1 } : {}),
          ...entrada,
        };
        if (this.accion === "upsert") {
          const columnas = (this.opciones.onConflict ?? "id").split(",").map((c) => c.trim());
          const previa = this.filas().find((x) => columnas.every((c) => x[c] === nueva[c]));
          if (previa) {
            if (this.opciones.ignoreDuplicates) continue;
            Object.assign(previa, entrada);
            if (CON_VERSION.has(this.tabla)) previa.version = (previa.version as number) + 1;
            anotar(this.base, this.tabla, previa, "upsert");
            hechas.push(previa);
            continue;
          }
        }
        const error = this.choca(nueva) ?? this.referencias(nueva);
        if (error) return { data: null, error };
        this.filas().push(nueva);
        anotar(this.base, this.tabla, nueva, "upsert");
        hechas.push(nueva);
      }
      return this.devolver ? this.resultado(hechas.map((f) => this.recortar(f))) : { data: null, error: null };
    }

    if (this.accion === "update") {
      const cambios = this.datos as Fila;
      const tocadas = this.filas().filter(pasa);
      for (const f of tocadas) {
        const nueva = { ...f, ...cambios };
        const error = this.choca(nueva, f) ?? this.referencias(nueva);
        if (error) return { data: null, error };
      }
      for (const f of tocadas) {
        Object.assign(f, cambios);
        if (CON_VERSION.has(this.tabla)) f.version = (f.version as number) + 1;
        anotar(this.base, this.tabla, f, "upsert");
      }
      return this.devolver ? this.resultado(tocadas.map((f) => this.recortar(f))) : { data: null, error: null };
    }

    // delete
    const quedan: Fila[] = [];
    for (const f of this.filas()) {
      if (pasa(f)) anotar(this.base, this.tabla, f, "delete");
      else quedan.push(f);
    }
    this.base.tablas[this.tabla] = quedan;
    return { data: null, error: null };
  }
}
