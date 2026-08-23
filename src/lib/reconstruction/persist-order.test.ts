import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Que la reconstrucción se escriba entera o no se escriba.
 *
 * `persistReconstruction` hacía entre diez y cien escrituras sueltas contra
 * PostgREST, cada una su propia transacción, y morirse a la mitad no era
 * teórico: pasó. Dejó la operación nueva creada, las viejas sin marcar como
 * huérfanas y las siguientes sin crear, y el panel enseñó +305 dólares en un
 * día en el que se ganaron 152 -- porque contaba dos versiones de la misma
 * operación a la vez.
 *
 * Ahora la escritura vive en `persist_reconstruction`, una función de Postgres
 * que hace las cuatro cosas en una transacción. Lo que estos tests vigilan es
 * que no vuelva a subir: basta con que alguien añada «un `update` rapidito»
 * fuera de la función para recuperar el fallo entero, y leyendo el archivo por
 * encima no se ve.
 */

const fuente = readFileSync(
  join(process.cwd(), "src/lib/reconstruction/persist.ts"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

describe("la escritura de la reconstrucción es atómica", () => {
  it("pasa por la función de Postgres, no por escrituras sueltas", () => {
    expect(fuente).toContain('rpc("persist_reconstruction"');
  });

  it("no escribe operaciones por su cuenta", () => {
    // Un `insert`/`update`/`upsert` sobre `trades` aquí arriba es una
    // escritura fuera de la transacción, y por tanto una forma de quedarse a
    // medias otra vez.
    const escrituras = /from\("trades"\)\s*\.(insert|update|upsert|delete)\(/g;
    expect(fuente.match(escrituras)).toBeNull();
  });

  it("no escribe enlaces de fills por su cuenta", () => {
    const escrituras = /from\("trade_fills"\)\s*\.(insert|update|upsert|delete)\(/g;
    expect(fuente.match(escrituras)).toBeNull();
  });

  it("no marca huérfanas por su cuenta", () => {
    // El marcado tiene que ir dentro de la misma transacción que la escritura;
    // fuera, un fallo posterior deja lo viejo y lo nuevo visibles a la vez.
    expect(fuente).not.toContain("orphaned_at: new Date().toISOString()");
  });

  it("le pasa a la función las huérfanas y el conjunto completo", () => {
    expect(fuente).toContain("p_orphaned_opening_fill_ids");
    expect(fuente).toContain("p_trades");
  });
});

describe("la función de Postgres hace las cuatro cosas, y en orden", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260819180000_reconstruccion_atomica.sql"),
    "utf8",
  );

  it("vacía los enlaces del ámbito antes de escribir los nuevos", () => {
    // `trade_fills` lleva UNIQUE (raw_fill_id, role) global: si los viejos
    // siguen ahí cuando los nuevos reclaman los mismos fills, la inserción
    // revienta. Dentro de una transacción el orden sigue importando.
    const vaciado = sql.indexOf("delete from public.trade_fills");
    const escritura = sql.indexOf("insert into public.trades");
    expect(vaciado).toBeGreaterThan(-1);
    expect(vaciado).toBeLessThan(escritura);
  });

  it("desmarca la huérfana que vuelve a existir", () => {
    // Un fill que llega tarde puede volver real una operación marcada como
    // huérfana, y tiene que volver, no quedarse escondida para siempre.
    expect(sql).toContain("orphaned_at = null");
  });

  it("casa cada operación por su fill de apertura", () => {
    // Es la clave estable que hace que `trades.id` -- y con él el diario, las
    // capturas y los comentarios -- sobreviva a un recálculo.
    expect(sql).toContain("on conflict (account_id, product_id, opening_fill_id)");
  });

  it("sólo la puede ejecutar el servicio, no cualquiera con sesión", () => {
    expect(sql).toContain("revoke all on function public.persist_reconstruction");
    expect(sql).toContain("grant execute on function public.persist_reconstruction");
  });
});
