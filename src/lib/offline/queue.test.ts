import { describe, expect, it } from "vitest";

import {
  dequeue,
  enqueue,
  markFailed,
  MAX_ATTEMPTS,
  MAX_QUEUED,
  pending,
  QUEUE_KEY,
  readQueue,
  writeQueue,
  type QueuedWrite,
  type Storage,
} from "./queue";

/** Un almacenamiento de mentira, para poder probar sin navegador. */
function almacen(inicial?: string): Storage & { valor: string | null } {
  return {
    valor: inicial ?? null,
    getItem() {
      return this.valor;
    },
    setItem(_k: string, v: string) {
      this.valor = v;
    },
  };
}

const escritura = (id: string): Omit<QueuedWrite, "attempts"> => ({
  id,
  url: "/api/habitos",
  method: "POST",
  body: { hecho: true },
  at: 1_700_000_000,
  label: `Marcaste ${id}`,
});

describe("leer la cola", () => {
  it("sin nada guardado está vacía", () => {
    expect(readQueue(almacen())).toEqual([]);
  });

  it("aguanta cualquier cosa en el almacenamiento", () => {
    // Una cola corrupta no puede impedir usar la aplicación.
    for (const basura of ["", "no es json", "3", "null", "{}", "[1,2,3]"]) {
      expect(() => readQueue(almacen(basura))).not.toThrow();
      expect(readQueue(almacen(basura))).toEqual([]);
    }
  });

  it("descarta las entradas mal formadas y conserva las buenas", () => {
    const mezcla = JSON.stringify([
      { ...escritura("a"), attempts: 0 },
      { id: "b" },
      { ...escritura("c"), attempts: 0 },
    ]);
    expect(readQueue(almacen(mezcla)).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("rechaza una URL que no sea de esta aplicación", () => {
    // La cola vive en un sitio que se puede editar a mano: una URL absoluta
    // sería un sitio al que la aplicación mandaría datos del usuario sin que
    // él lo haya pedido.
    const fuera = JSON.stringify([
      { ...escritura("a"), url: "https://otro-sitio.example/recoger", attempts: 0 },
      { ...escritura("b"), url: "//otro-sitio.example/recoger", attempts: 0 },
      { ...escritura("c"), attempts: 0 },
    ]);
    expect(readQueue(almacen(fuera)).map((e) => e.id)).toEqual(["c"]);
  });

  it("rechaza métodos que no sean de escritura", () => {
    const conGet = JSON.stringify([{ ...escritura("a"), method: "GET", attempts: 0 }]);
    expect(readQueue(almacen(conGet))).toEqual([]);
  });

  it("un almacenamiento que lanza no revienta la lectura", () => {
    // En una ventana privada o con las cookies bloqueadas, tocarlo *lanza*.
    const roto: Storage = {
      getItem() {
        throw new Error("bloqueado");
      },
      setItem() {},
    };
    expect(readQueue(roto)).toEqual([]);
  });
});

describe("encolar", () => {
  it("añade al final", () => {
    const cola = enqueue(enqueue([], escritura("a")), escritura("b"));
    expect(cola.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("la misma intención no se duplica, se reemplaza", () => {
    // Marcar y desmarcar el mismo hábito tres veces tiene que dejar una
    // entrada con lo último, no tres que se pisan al enviarse.
    let cola = enqueue([], { ...escritura("habito-12-ago"), body: { hecho: true } });
    cola = enqueue(cola, { ...escritura("habito-12-ago"), body: { hecho: false } });
    cola = enqueue(cola, { ...escritura("habito-12-ago"), body: { hecho: true } });

    expect(cola).toHaveLength(1);
    expect(cola[0].body).toEqual({ hecho: true });
  });

  it("reemplazar reinicia los intentos", () => {
    // Es una intención nueva: no hereda los fallos de la anterior.
    let cola = enqueue([], escritura("x"));
    cola = markFailed(cola, "x");
    cola = enqueue(cola, escritura("x"));
    expect(cola[0].attempts).toBe(0);
  });

  it("no crece sin límite, y lo que cae es lo más viejo", () => {
    let cola: QueuedWrite[] = [];
    for (let i = 0; i < MAX_QUEUED + 10; i += 1) cola = enqueue(cola, escritura(`e${i}`));

    expect(cola).toHaveLength(MAX_QUEUED);
    expect(cola[0].id).toBe("e10");
    expect(cola.at(-1)!.id).toBe(`e${MAX_QUEUED + 9}`);
  });
});

describe("reintentos", () => {
  it("cuenta los fallos", () => {
    let cola = enqueue([], escritura("x"));
    cola = markFailed(cola, "x");
    cola = markFailed(cola, "x");
    expect(cola[0].attempts).toBe(2);
  });

  it("después de varios fallos se descarta en vez de bloquear la cola", () => {
    // Cinco fallos no son un problema de red: es una escritura que el
    // servidor rechaza, y reintentarla para siempre bloquea lo que hay
    // detrás.
    let cola = enqueue(enqueue([], escritura("mala")), escritura("buena"));
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) cola = markFailed(cola, "mala");

    expect(cola.map((e) => e.id)).toEqual(["buena"]);
  });

  it("`pending` deja fuera las agotadas", () => {
    const agotada: QueuedWrite = { ...escritura("x"), attempts: MAX_ATTEMPTS };
    expect(pending([agotada])).toEqual([]);
  });

  it("quitar una no toca las demás", () => {
    const cola = enqueue(enqueue([], escritura("a")), escritura("b"));
    expect(dequeue(cola, "a").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("guardar", () => {
  it("da la vuelta completa sin perder nada", () => {
    const store = almacen();
    const cola = enqueue(enqueue([], escritura("a")), escritura("b"));
    writeQueue(store, cola);
    expect(readQueue(store)).toEqual(cola);
  });

  it("usa una clave propia", () => {
    expect(QUEUE_KEY).toContain("cola");
  });

  it("un almacenamiento lleno no lanza", () => {
    const lleno: Storage = {
      getItem: () => null,
      setItem() {
        throw new Error("sin sitio");
      },
    };
    expect(() => writeQueue(lleno, [])).not.toThrow();
  });
});
