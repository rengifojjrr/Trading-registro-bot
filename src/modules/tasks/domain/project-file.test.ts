import { describe, expect, it } from "vitest";

import {
  escribirArchivoProyecto,
  esArchivoPrivado,
  leerArchivoProyecto,
  nombreDeArchivo,
  type ArchivoParaEscribir,
  type ArchivoProyecto,
} from "./project-file";

/**
 * El lector del archivo de proyecto.
 *
 * Todo lo de aquí es inventado: «Finca El Roble», Lucía, Tomás e Inés no
 * existen. El repositorio es público.
 */

const HOY = "2026-10-06";

/** Ids predecibles: 00000000-0000-7000-8000-000000000001, …002, … */
function contador() {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`;
  };
}

function leer(texto: string, nombreArchivo?: string): ArchivoProyecto {
  const r = leerArchivoProyecto(texto, { nuevoId: contador(), hoy: HOY, nombreArchivo });
  if (!r.ok) throw new Error(r.error);
  return r.archivo;
}

const PLANTILLA = `---
proyecto: Finca El Roble
slug: finca-el-roble
alias: [finca, roble, el campo]
estado: en marcha            # idea | en marcha | esperando | atascado | en pausa | terminado | descartado
nube: completa               # completa | solo titulos | reservado
objetivo: Tener la finca lista para alquilar en primavera
inicio: 2026-10-01
meta: 2027-03-31
color: green
icono: 🌳
---

## Cómo va
Esperando el presupuesto del tejado; el permiso va lento.

## Ficha técnica
| Sección | Dato | Valor |
|---|---|---|
| Finca | Dónde | Un valle inventado |
| Finca | Hectáreas | 3 |

Riesgos: que llueva antes de cerrar el tejado.

## Personas
| Persona | Papel | Lado | Qué hace | WhatsApp |
|---|---|---|---|---|
| Yo | Coordinador | nosotros | junto a todos, reviso presupuestos | — |
| Lucía | Arquitecta | nosotros | planos y permiso de obra | sí (Lucía arq.) |
| Tomás | Contratista | contraparte | el tejado y la obra | sí |
| Inés | Abogada | asesor | el contrato de alquiler | no |

## Frentes
- Permisos (Lucía) · Obra (Tomás) · Legal (Inés)

## Hoja de ruta
### Etapa 1 — Arreglos (2026-10-01 → 2026-12-15)
- [x] Primera visita con Lucía y Tomás — 2026-10-05
- [ ] Tejado nuevo — @Tomás — 2026-11-30
### Etapa 2 — Alquiler (2027-01)
- [ ] Contrato firmado — 2027-02

## Tareas
- [ ] Llamar a la abogada — @yo — 2026-10-09 — #Legal
- [ ] Mandar el presupuesto del tejado — @Tomás — 2026-10-15 — #Obra — (llamada 2026-10-05)
  - [ ] Pedir tres precios de teja — @Tomás
- [~] Planos de la cocina — @Lucía — 2026-10-20 — !alta
- [x] Presentarme con Tomás — @yo

## Recordatorios
- todos los días 08:00 — Mirar el tiempo
- cada lunes 09:00 — qué falta en la finca

## Bitácora
- 2026-10-05 — decisión — No empezamos la obra sin el permiso.
- 2026-10-04 — Primera llamada con Lucía.

## Enlaces
- Planos borrador — https://ejemplo.test/planos.pdf
- Escritura de la finca (en la Mac)
`;

describe("leer la plantilla", () => {
  const a = leer(PLANTILLA);

  it("la cabecera", () => {
    expect(a.nombre).toBe("Finca El Roble");
    expect(a.slug).toBe("finca-el-roble");
    expect(a.alias).toEqual(["finca", "roble", "el campo"]);
    expect(a.estado).toBe("EN_MARCHA");
    expect(a.nube).toBe("COMPLETA");
    expect(a.objetivo).toBe("Tener la finca lista para alquilar en primavera");
    expect(a.inicio).toBe("2026-10-01");
    expect(a.meta).toBe("2027-03-31");
    expect(a.color).toBe("green");
    expect(a.icono).toBe("🌳");
    expect(a.ref).toBeNull();
  });

  it("los comentarios de la cabecera no se cuelan en el valor", () => {
    expect(a.estado).toBe("EN_MARCHA");
    expect(a.avisos.map((x) => x.texto)).not.toContainEqual(expect.stringContaining("estado"));
  });

  it("cómo va y la ficha, tal cual", () => {
    expect(a.comoVa).toBe("Esperando el presupuesto del tejado; el permiso va lento.");
    expect(a.ficha).toContain("| Finca | Hectáreas | 3 |");
    expect(a.ficha).toContain("Riesgos: que llueva");
  });

  it("las personas, con su papel, su lado, qué hacen y si tienen WhatsApp", () => {
    expect(a.personas.map((p) => p.nombre)).toEqual(["Yo", "Lucía", "Tomás", "Inés"]);
    const [yo, lucia, tomas, ines] = a.personas;
    expect(yo.esYo).toBe(true);
    expect(yo.whatsapp).toBeNull();
    expect(lucia).toMatchObject({ papel: "Arquitecta", lado: "NOSOTROS", hace: "planos y permiso de obra", whatsapp: "SI" });
    expect(tomas.lado).toBe("CONTRAPARTE");
    expect(ines).toMatchObject({ lado: "ASESOR", whatsapp: "NO" });
  });

  it("los frentes con su responsable", () => {
    expect(a.frentes.map((f) => [f.nombre, f.responsable])).toEqual([
      ["Permisos", "Lucía"],
      ["Obra", "Tomás"],
      ["Legal", "Inés"],
    ]);
  });

  it("la hoja de ruta: etapas con fechas y sus hitos", () => {
    expect(a.etapas.map((e) => [e.titulo, e.inicio, e.fin])).toEqual([
      ["Arreglos", "2026-10-01", "2026-12-15"],
      ["Alquiler", "2027-01-01", "2027-01-31"],
    ]);
    expect(a.hitos.map((h) => [h.titulo, h.estado, h.fecha, h.precision, h.responsable, h.etapa])).toEqual([
      ["Primera visita con Lucía y Tomás", "HECHO", "2026-10-05", "DIA", null, 0],
      ["Tejado nuevo", "PENDIENTE", "2026-11-30", "DIA", "Tomás", 0],
      ["Contrato firmado", "PENDIENTE", "2027-02-28", "MES", null, 1],
    ]);
  });

  it("las tareas: responsable, fecha, frente, prioridad, origen y subtareas", () => {
    expect(a.tareas).toHaveLength(5);
    const [abogada, presupuesto, precios, planos, presentarme] = a.tareas;
    expect(abogada).toMatchObject({ titulo: "Llamar a la abogada", responsable: "yo", fecha: "2026-10-09", frente: "Legal", estado: "NO_INICIADA", padre: null });
    expect(presupuesto).toMatchObject({ responsable: "Tomás", frente: "Obra", origen: { tipo: "LLAMADA", texto: "llamada 2026-10-05" } });
    expect(precios).toMatchObject({ titulo: "Pedir tres precios de teja", padre: 1 });
    expect(planos).toMatchObject({ estado: "EN_CURSO", prioridad: "ALTA" });
    expect(presentarme.estado).toBe("HECHA");
  });

  it("los recordatorios se leen pero no son nada todavía", () => {
    expect(a.recordatorios).toHaveLength(2);
  });

  it("la bitácora, con tipo o sin él", () => {
    expect(a.bitacora.map((b) => [b.fecha, b.tipo, b.texto])).toEqual([
      ["2026-10-05", "DECISION", "No empezamos la obra sin el permiso."],
      ["2026-10-04", "NOTA", "Primera llamada con Lucía."],
    ]);
  });

  it("los enlaces y los documentos que viven en la Mac", () => {
    expect(a.enlaces.map((l) => [l.etiqueta, l.url, l.enMac])).toEqual([
      ["Planos borrador", "https://ejemplo.test/planos.pdf", false],
      ["Escritura de la finca", null, true],
    ]);
  });

  it("cada cosa lleva un id nuevo distinto, nacido aquí", () => {
    const ids = [
      a.nuevoId,
      ...a.personas,
      ...a.frentes,
      ...a.etapas,
      ...a.hitos,
      ...a.tareas,
      ...a.bitacora,
      ...a.enlaces,
    ].map((x) => (typeof x === "string" ? x : x.nuevoId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sin avisos: la plantilla se entiende entera", () => {
    expect(a.avisos).toEqual([]);
    expect(a.faltan).toBe(0);
  });
});

describe("lo privado no se lee nunca", () => {
  it("por el nombre del archivo", () => {
    const r = leerArchivoProyecto(PLANTILLA, { nombreArchivo: "finca-el-roble.privado.md" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("privado");
  });

  it("por la cabecera", () => {
    expect(esArchivoPrivado("---\nproyecto: X\nprivado: sí\n---\n")).toBe(true);
    expect(leerArchivoProyecto("---\nproyecto: X\nprivado: true\n---\n").ok).toBe(false);
  });

  it("por el encabezado de la plantilla privada", () => {
    expect(esArchivoPrivado("# Finca El Roble — PRIVADO (nunca sube)\n- Montos: …")).toBe(true);
    expect(esArchivoPrivado("<!-- PRIVADO: no subir -->\n# Finca\n")).toBe(true);
  });

  it("pero un archivo normal que nombra al privado sí se lee", () => {
    const texto = "# Proyecto: Finca\n<!-- Lo sensible va en finca.privado.md, que es Privado. -->\n## Cómo va\nBien.\n";
    expect(esArchivoPrivado(texto, "finca.md")).toBe(false);
    expect(leer(texto, "finca.md").comoVa).toBe("Bien.");
  });
});

describe("lo que no se entiende se dice", () => {
  it("sin nombre no hay proyecto", () => {
    const r = leerArchivoProyecto("## Tareas\n- [ ] algo\n");
    expect(r.ok).toBe(false);
  });

  it("un archivo enorme no es un proyecto", () => {
    const r = leerArchivoProyecto(`# X\n${"a".repeat(200_001)}`);
    expect(r.ok).toBe(false);
  });

  it("una sección desconocida se salta y avisa", () => {
    const a = leer("# Proyecto: Finca\n## Presupuesto\n- 3 euros\n## Tareas\n- [ ] Algo\n");
    expect(a.tareas).toHaveLength(1);
    expect(a.avisos.map((x) => x.texto)).toContainEqual(expect.stringContaining("«Presupuesto»"));
  });

  it("lo que sobra de una tarea va a su nota y se avisa", () => {
    const a = leer("# Finca\n## Tareas\n- [ ] Comprar teja — sin prisa\n");
    expect(a.tareas[0].notas).toBe("sin prisa");
    expect(a.avisos).toHaveLength(1);
    expect(a.avisos[0].linea).toBe(3);
  });

  it("un nombre de más de 60 se corta y se avisa", () => {
    const a = leer(`---\nproyecto: ${"x".repeat(70)}\n---\n`);
    expect(a.nombre).toHaveLength(60);
    expect(a.avisos.length).toBeGreaterThan(0);
  });
});

describe("un borrador suelto, sin cabecera ni tablas", () => {
  const BORRADOR = `# Proyecto: Finca El Roble
<!-- Borrador.
     Lo sensible va aparte. -->

## Estado
- Semáforo: amarillo (arrancando)
- Cómo va: Lucía mandó los planos; los estoy leyendo.

## Objetivo
- (falta: lo cuenta el dueño)

## Personas
- **Yo** (yo) — (falta: su papel)
- **Lucía** — arquitecta — los planos
- **Tomás** (el contratista de siempre) — (falta: qué hace)

## Tareas
- [ ] Lucía: revisar el permiso — origen: llamada del 05/10
- [ ] (falta: lo de la llamada)

## Bitácora
- 05/10/2026: Lucía manda los planos; hablo con Tomás
  y quedamos en vernos.
`;
  const a = leer(BORRADOR);

  it("saca el nombre del encabezado y «cómo va» del estado", () => {
    expect(a.nombre).toBe("Finca El Roble");
    expect(a.comoVa).toBe("Lucía mandó los planos; los estoy leyendo.");
    expect(a.avisos.map((x) => x.texto)).toContainEqual(expect.stringContaining("semáforo"));
  });

  it("las personas de la lista", () => {
    expect(a.personas.map((p) => [p.nombre, p.esYo, p.papel, p.hace, p.nota])).toEqual([
      ["Yo", true, null, null, null],
      ["Lucía", false, "arquitecta", "los planos", null],
      ["Tomás", false, null, null, "el contratista de siempre"],
    ]);
  });

  it("«Lucía: revisar…» es una tarea de Lucía porque está en Personas", () => {
    expect(a.tareas).toHaveLength(1);
    expect(a.tareas[0]).toMatchObject({
      titulo: "revisar el permiso",
      responsable: "Lucía",
      origen: { tipo: "LLAMADA", texto: "llamada del 05/10" },
    });
  });

  it("una línea partida en dos es una sola entrada, con su fecha", () => {
    expect(a.bitacora).toHaveLength(1);
    expect(a.bitacora[0].fecha).toBe("2026-10-05");
    expect(a.bitacora[0].texto).toBe("Lucía manda los planos; hablo con Tomás y quedamos en vernos.");
  });

  it("cuenta lo que falta por rellenar", () => {
    expect(a.faltan).toBeGreaterThanOrEqual(4);
    expect(a.objetivo).toBeNull();
  });

  it("los números de línea siguen siendo los del archivo aunque haya comentarios de varias líneas", () => {
    expect(a.tareas[0].linea).toBe(18);
  });
});

describe("exportar y volver a leer", () => {
  const DATOS: ArchivoParaEscribir = {
    id: "11111111-1111-7111-8111-111111111111",
    nombre: "Finca El Roble",
    slug: "finca-el-roble",
    alias: ["finca"],
    estado: "ESPERANDO",
    objetivo: "Alquilarla en primavera",
    inicio: "2026-10-01",
    meta: "2027-03-31",
    color: "green",
    icono: "🌳",
    comoVa: "Esperando a Tomás — el tejado.",
    ficha: "| Dato | Valor |\n|---|---|\n| Hectáreas | 3 |",
    personas: [
      { id: "22222222-2222-7222-8222-222222222220", nombre: "Yo", esYo: true, alias: [], relacion: null, papel: "Coordinador", lado: "NOSOTROS", hace: "todo", whatsapp: null, nota: null },
      { id: "22222222-2222-7222-8222-222222222221", nombre: "Lucía", esYo: false, alias: ["Lu"], relacion: "amiga de la familia", papel: "Arquitecta", lado: "NOSOTROS", hace: "planos | permiso", whatsapp: "SI", nota: "Prefiere audios" },
    ],
    frentes: [{ id: "33333333-3333-7333-8333-333333333331", nombre: "Obra", responsable: "Lucía" }],
    etapas: [
      {
        id: "44444444-4444-7444-8444-444444444441",
        titulo: "Arreglos",
        inicio: "2026-10-01",
        fin: "2026-12-15",
        hitos: [{ id: "55555555-5555-7555-8555-555555555551", titulo: "Tejado", fecha: "2026-11-30", precision: "DIA", estado: "EN_CURSO", responsable: "Lucía" }],
      },
    ],
    hitosSueltos: [{ id: "55555555-5555-7555-8555-555555555552", titulo: "Contrato", fecha: "2027-02-28", precision: "MES", estado: "PENDIENTE", responsable: null }],
    tareas: [
      {
        id: "66666666-6666-7666-8666-666666666661",
        titulo: "Pedir presupuesto",
        estado: "NO_INICIADA",
        responsable: "Lucía",
        fecha: "2026-10-15",
        frente: "Obra",
        prioridad: "ALTA",
        origen: "llamada 5 oct",
        subtareas: [
          { id: "66666666-6666-7666-8666-666666666662", titulo: "Tres precios", estado: "HECHA", responsable: "yo", fecha: null, frente: null, prioridad: "MEDIA", origen: null },
        ],
      },
    ],
    bitacora: [{ id: "77777777-7777-7777-8777-777777777771", fecha: "2026-10-05", tipo: "DECISION", texto: "Sin permiso no hay obra." }],
    enlaces: [
      { id: "88888888-8888-7888-8888-888888888881", etiqueta: "Planos", url: "https://ejemplo.test/p.pdf", enMac: false },
      { id: "88888888-8888-7888-8888-888888888882", etiqueta: "Escritura", url: null, enMac: true },
    ],
    hoy: HOY,
  };

  const texto = escribirArchivoProyecto(DATOS);
  const a = leer(texto);

  it("cada cosa vuelve con su id", () => {
    expect(a.ref).toBe(DATOS.id);
    expect(a.personas.map((p) => p.ref)).toEqual(DATOS.personas.map((p) => p.id));
    expect(a.frentes[0].ref).toBe(DATOS.frentes[0].id);
    expect(a.etapas[0].ref).toBe(DATOS.etapas[0].id);
    expect(a.hitos.map((h) => h.ref)).toEqual([DATOS.hitosSueltos[0].id, DATOS.etapas[0].hitos[0].id]);
    expect(a.tareas.map((t) => t.ref)).toEqual([DATOS.tareas[0].id, DATOS.tareas[0].subtareas[0].id]);
    expect(a.bitacora[0].ref).toBe(DATOS.bitacora[0].id);
    expect(a.enlaces.map((l) => l.ref)).toEqual(DATOS.enlaces.map((l) => l.id));
  });

  it("y con lo que decía", () => {
    expect(a).toMatchObject({
      nombre: "Finca El Roble",
      slug: "finca-el-roble",
      alias: ["finca"],
      estado: "ESPERANDO",
      nube: "COMPLETA",
      objetivo: "Alquilarla en primavera",
      color: "green",
      icono: "🌳",
    });
    // «Cómo va» es un párrafo: su raya no es un separador y vuelve tal cual.
    expect(a.comoVa).toBe("Esperando a Tomás — el tejado.");
    expect(a.ficha).toContain("| Hectáreas | 3 |");
    expect(a.personas[1]).toMatchObject({ nombre: "Lucía", alias: ["Lu"], relacion: "amiga de la familia", papel: "Arquitecta", hace: "planos / permiso", whatsapp: "SI", nota: "Prefiere audios" });
    expect(a.personas[0].esYo).toBe(true);
    expect(a.hitos[0]).toMatchObject({ titulo: "Contrato", fecha: "2027-02-28", precision: "MES", etapa: null });
    expect(a.hitos[1]).toMatchObject({ titulo: "Tejado", estado: "EN_CURSO", responsable: "Lucía", etapa: 0 });
    expect(a.tareas[0]).toMatchObject({ titulo: "Pedir presupuesto", responsable: "Lucía", fecha: "2026-10-15", frente: "Obra", prioridad: "ALTA", origen: { tipo: "LLAMADA", texto: "llamada 5 oct" } });
    expect(a.tareas[1]).toMatchObject({ titulo: "Tres precios", estado: "HECHA", responsable: "yo", padre: 0 });
    expect(a.bitacora[0]).toMatchObject({ fecha: "2026-10-05", tipo: "DECISION", texto: "Sin permiso no hay obra." });
    expect(a.enlaces[1]).toMatchObject({ etiqueta: "Escritura", enMac: true });
    expect(a.avisos).toEqual([]);
  });

  it("el archivo lleva el id del proyecto y su nombre de archivo sale del slug", () => {
    expect(texto).toContain(`id: ${DATOS.id}`);
    expect(nombreDeArchivo("finca-el-roble", "Finca")).toBe("finca-el-roble.md");
    expect(nombreDeArchivo(null, "Casa de Ña Pía")).toBe("casa-de-na-pia.md");
  });
});
