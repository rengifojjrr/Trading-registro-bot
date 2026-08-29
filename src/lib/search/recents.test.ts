import { describe, expect, it } from "vitest";

import { MAX_RECENTS, pushRecent, readRecents, type RecentsStorage } from "./recents";

function almacen(inicial?: string): RecentsStorage & { valor: string | null } {
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

const resultado = (id: string) => ({
  kind: "trade" as const,
  id,
  title: `Operación ${id}`,
  href: `/trades/${id}`,
});

describe("leer los recientes", () => {
  it("sin nada guardado está vacío", () => {
    expect(readRecents(almacen())).toEqual([]);
  });

  it("aguanta cualquier cosa", () => {
    for (const basura of ["", "x", "3", "null", "{}"]) {
      expect(readRecents(almacen(basura))).toEqual([]);
    }
  });

  it("descarta un enlace que no sea de esta aplicación", () => {
    // Lo guardado se puede editar a mano: una URL absoluta aquí sería un
    // enlace a otro sitio dentro del buscador.
    const fuera = JSON.stringify([
      { kind: "trade", id: "a", title: "x", href: "https://otro.example", at: 1 },
      { kind: "trade", id: "b", title: "y", href: "//otro.example", at: 1 },
      { kind: "trade", id: "c", title: "z", href: "/trades/c", at: 1 },
    ]);
    expect(readRecents(almacen(fuera)).map((r) => r.id)).toEqual(["c"]);
  });

  it("un almacenamiento que lanza no revienta", () => {
    const roto: RecentsStorage = {
      getItem() {
        throw new Error("bloqueado");
      },
      setItem() {},
    };
    expect(readRecents(roto)).toEqual([]);
  });
});

describe("apuntar", () => {
  it("lo último va primero", () => {
    const store = almacen();
    pushRecent(store, resultado("a"));
    const lista = pushRecent(store, resultado("b"));
    expect(lista.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("volver a abrir sube, no duplica", () => {
    // La lista es «lo último», no «todo lo que abriste».
    const store = almacen();
    pushRecent(store, resultado("a"));
    pushRecent(store, resultado("b"));
    const lista = pushRecent(store, resultado("a"));
    expect(lista.map((r) => r.id)).toEqual(["a", "b"]);
    expect(lista).toHaveLength(2);
  });

  it("no crece sin límite", () => {
    const store = almacen();
    let lista = readRecents(store);
    for (let n = 0; n < MAX_RECENTS + 5; n += 1) lista = pushRecent(store, resultado(`e${n}`));
    expect(lista).toHaveLength(MAX_RECENTS);
    expect(lista[0].id).toBe(`e${MAX_RECENTS + 4}`);
  });

  it("da la vuelta completa", () => {
    const store = almacen();
    const lista = pushRecent(store, resultado("a"));
    expect(readRecents(store)).toEqual(lista);
  });

  it("un almacenamiento lleno no impide navegar", () => {
    const lleno: RecentsStorage = {
      getItem: () => null,
      setItem() {
        throw new Error("sin sitio");
      },
    };
    expect(() => pushRecent(lleno, resultado("a"))).not.toThrow();
  });
});
