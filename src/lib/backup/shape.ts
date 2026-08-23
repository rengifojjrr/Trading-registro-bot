/**
 * Si la copia de seguridad de verdad se podría restaurar.
 *
 * Había copias automáticas desde hace tiempo y nadie había abierto una nunca.
 * Una copia que no se ha restaurado jamás no es una copia: es un rumor. El
 * momento de descubrir que el fichero está truncado, que le falta una tabla o
 * que se guardó vacío no puede ser el día que se pierde la base de datos.
 *
 * Esto no restaura nada: mira el fichero y dice qué tiene y qué le falta. Es la
 * mitad que se puede ejecutar todas las semanas sin riesgo, y la que contesta
 * la única pregunta que importa antes del desastre.
 *
 * Puro: recibe el JSON ya leído y no toca ni disco ni red.
 */

/**
 * Sin estas tablas no se puede reconstruir nada.
 *
 * `raw_fills` es de donde sale cada operación y cada cifra de P&L; `products`
 * tiene los multiplicadores de contrato, y sin ellos los mismos fills dan
 * números distintos. Una copia sin una de las dos parece completa y no lo está.
 */
export const ESSENTIAL_TABLES = ["raw_fills", "products"] as const;

/**
 * Lo que no vive en ningún otro sitio.
 *
 * Las operaciones y las estadísticas se recalculan desde `raw_fills`; una nota
 * de diario, una verificación manual o un ajuste no se recalculan desde nada.
 * Si se pierden, se perdieron.
 */
export const IRREPLACEABLE_TABLES = [
  "journal_entries",
  "trade_comments",
  "trade_verifications",
  "trade_grouping_overrides",
  "trade_mistakes",
  "trade_playbook_checks",
  "chart_drawings",
  "strategies",
  "playbook_items",
  "tags",
  "trade_tags",
  "app_settings",
] as const;

export interface TableReport {
  table: string;
  rows: number;
  /** Presente en el fichero, aunque esté a cero. */
  present: boolean;
  essential: boolean;
}

export interface BackupReport {
  ok: boolean;
  exportedAt: string | null;
  tables: TableReport[];
  totalRows: number;
  /** Lo que impide restaurar. Vacío cuando la copia sirve. */
  problems: string[];
  /** Lo que no impide restaurar pero conviene saber. */
  warnings: string[];
  summary: string;
}

export function inspectBackup(payload: unknown): BackupReport {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      exportedAt: null,
      tables: [],
      totalRows: 0,
      problems: ["El fichero no es una copia de seguridad de esta aplicación."],
      warnings: [],
      summary: "El fichero no se pudo leer como copia de seguridad.",
    };
  }

  const obj = payload as Record<string, unknown>;
  const exportedAt = typeof obj.exportedAt === "string" ? obj.exportedAt : null;
  if (exportedAt === null) {
    warnings.push("La copia no dice cuándo se hizo.");
  }

  const conocidas = [...ESSENTIAL_TABLES, ...IRREPLACEABLE_TABLES];
  const tables: TableReport[] = [];
  let totalRows = 0;

  for (const table of conocidas) {
    const value = obj[table];
    const present = Array.isArray(value);
    const rows = present ? (value as unknown[]).length : 0;
    const essential = (ESSENTIAL_TABLES as readonly string[]).includes(table);

    if (!present) {
      const texto = `Falta la tabla «${table}».`;
      if (essential) problems.push(texto);
      else warnings.push(texto);
    } else if (rows === 0 && essential) {
      problems.push(`«${table}» está vacía, y sin ella no se puede reconstruir nada.`);
    }

    totalRows += rows;
    tables.push({ table, rows, present, essential });
  }

  const ok = problems.length === 0;

  return {
    ok,
    exportedAt,
    tables,
    totalRows,
    problems,
    warnings,
    summary: ok
      ? `La copia se puede restaurar: ${totalRows} filas en ${tables.filter((t) => t.present).length} tablas.`
      : `Esta copia no se podría restaurar entera: ${problems.length} problema${problems.length === 1 ? "" : "s"}.`,
  };
}

/**
 * La copia contra lo que hay ahora mismo en la base de datos.
 *
 * Una copia que se hizo bien hace tres meses y no ha vuelto a correr también
 * está rota, y por el fichero no se nota: hay que compararla con lo de hoy.
 */
export interface DriftRow {
  table: string;
  inBackup: number;
  inDatabase: number;
  missing: number;
}

export function compareToLive(
  report: BackupReport,
  live: Record<string, number>,
): { rows: DriftRow[]; stale: boolean; message: string } {
  const rows: DriftRow[] = report.tables.map((t) => {
    const enBase = live[t.table] ?? 0;
    return {
      table: t.table,
      inBackup: t.rows,
      inDatabase: enBase,
      missing: Math.max(0, enBase - t.rows),
    };
  });

  const conFaltantes = rows.filter((r) => r.missing > 0);
  const stale = conFaltantes.length > 0;

  if (!stale) {
    return { rows, stale, message: "La copia está al día con la base de datos." };
  }

  const total = conFaltantes.reduce((sum, r) => sum + r.missing, 0);
  const peor = [...conFaltantes].sort((a, b) => b.missing - a.missing)[0];

  return {
    rows,
    stale,
    // Se dice cuánto se perdería, no «la copia está desactualizada»: el número
    // es lo que hace decidir si vale la pena hacer una ahora.
    message: `Si restauraras esta copia perderías ${total} fila${total === 1 ? "" : "s"} de lo que hay ahora, la mayoría de «${peor.table}» (${peor.missing}).`,
  };
}
