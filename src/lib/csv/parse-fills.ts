import { Decimal } from "decimal.js";

/**
 * Turns mapped CSV rows into the raw_fills shape.
 *
 * Deliberately produces *fills*, not trades: the CSV importer feeds the
 * same reconstruction engine the Coinbase sync does, so both paths compute
 * P&L exactly one way. An importer that wrote trades directly would be a
 * second, silently-diverging source of truth for the app's most important
 * numbers.
 *
 * Nothing here touches the database or throws -- every row either parses
 * or is reported with the reason, so a single bad line can't abort an
 * import or, worse, be skipped unnoticed.
 */

/** Which CSV column supplies each required field. Values are column headers from the uploaded file. */
export interface ColumnMapping {
  entryId: string;
  tradeTime: string;
  side: string;
  price: string;
  size: string;
  commission?: string;
  productId?: string;
  orderId?: string;
}

export const REQUIRED_MAPPING_FIELDS = ["entryId", "tradeTime", "side", "price", "size"] as const;

/** Big enough for years of manual history, small enough that one request can't exhaust the server. */
export const MAX_IMPORT_ROWS = 5000;

export interface ParsedFill {
  entryId: string;
  productId: string;
  orderId: string | null;
  tradeTime: string; // ISO
  side: "BUY" | "SELL";
  price: string;
  size: string;
  commission: string;
}

export interface RowError {
  /** 1-based row number as the user sees it in a spreadsheet, header excluded. */
  row: number;
  reason: string;
}

export interface ParseResult {
  fills: ParsedFill[];
  errors: RowError[];
  /** Rows whose entryId appeared more than once *within the file*. */
  duplicateEntryIds: string[];
}

function normalizeSide(raw: string): "BUY" | "SELL" | null {
  const value = raw.trim().toUpperCase();
  if (["BUY", "B", "COMPRA", "LONG"].includes(value)) return "BUY";
  if (["SELL", "S", "VENTA", "SHORT"].includes(value)) return "SELL";
  return null;
}

/** Accepts a plain number or a number with thousands separators / currency noise, but never guesses at genuinely ambiguous text. */
function parseAmount(raw: string): Decimal | null {
  const cleaned = raw.trim().replace(/[$\s]/g, "").replace(/,/g, "");
  if (cleaned === "") return null;
  try {
    const value = new Decimal(cleaned);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

function parseTimestamp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseFillRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  defaults: { productId: string },
): ParseResult {
  const fills: ParsedFill[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  const duplicateEntryIds = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const get = (column: string | undefined) => (column ? (row[column] ?? "").trim() : "");

    const entryId = get(mapping.entryId);
    if (!entryId) {
      errors.push({ row: rowNumber, reason: "Sin identificador de fill." });
      return;
    }
    if (seen.has(entryId)) {
      // Reported rather than imported: entry_id is the primary key, so a
      // repeat inside one file is either a duplicated export or the wrong
      // column mapped as the id.
      duplicateEntryIds.add(entryId);
      errors.push({ row: rowNumber, reason: `Identificador repetido en el archivo: ${entryId}` });
      return;
    }

    const side = normalizeSide(get(mapping.side));
    if (!side) {
      errors.push({ row: rowNumber, reason: `Lado no reconocido: "${get(mapping.side)}"` });
      return;
    }

    const price = parseAmount(get(mapping.price));
    if (!price || price.lte(0)) {
      errors.push({ row: rowNumber, reason: `Precio inválido: "${get(mapping.price)}"` });
      return;
    }

    const size = parseAmount(get(mapping.size));
    if (!size || size.lte(0)) {
      errors.push({ row: rowNumber, reason: `Cantidad inválida: "${get(mapping.size)}"` });
      return;
    }

    const tradeTime = parseTimestamp(get(mapping.tradeTime));
    if (!tradeTime) {
      errors.push({ row: rowNumber, reason: `Fecha inválida: "${get(mapping.tradeTime)}"` });
      return;
    }

    // A missing commission column means zero, which is a real possibility
    // (some exports omit it); a present-but-unparseable value is an error,
    // because silently treating it as zero would understate costs.
    let commission = new Decimal(0);
    if (mapping.commission) {
      const rawCommission = get(mapping.commission);
      if (rawCommission !== "") {
        const parsed = parseAmount(rawCommission);
        if (!parsed) {
          errors.push({ row: rowNumber, reason: `Comisión inválida: "${rawCommission}"` });
          return;
        }
        commission = parsed.abs();
      }
    }

    seen.add(entryId);
    fills.push({
      entryId,
      productId: get(mapping.productId) || defaults.productId,
      orderId: get(mapping.orderId) || null,
      tradeTime,
      side,
      price: price.toString(),
      size: size.toString(),
      commission: commission.toString(),
    });
  });

  return { fills, errors, duplicateEntryIds: [...duplicateEntryIds] };
}

/**
 * Guesses a mapping from the file's own headers. Only ever a starting
 * point -- the wizard shows the result for confirmation, because a wrong
 * guess here would mis-import real money figures.
 */
const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
  entryId: ["entry_id", "entryid", "fill_id", "id", "trade_id"],
  tradeTime: ["trade_time", "time", "fecha", "date", "timestamp", "created_at"],
  side: ["side", "lado", "direction", "type"],
  price: ["price", "precio", "fill_price", "avg_price"],
  size: ["size", "cantidad", "quantity", "qty", "amount", "filled"],
  commission: ["commission", "comision", "comisión", "fee", "fees"],
  productId: ["product_id", "product", "producto", "symbol", "market", "instrument"],
  orderId: ["order_id", "orderid", "orden"],
};

/** Matches a hint only at underscore boundaries, so "fill_price_usd" matches "fill_price" but "precious" doesn't match "price". */
function matchesLoosely(key: string, hint: string): boolean {
  return `_${key}_`.includes(`_${hint}_`);
}

export function guessMapping(headers: string[]): Partial<ColumnMapping> {
  const normalized = headers.map((h) => ({ raw: h, key: h.trim().toLowerCase().replace(/\s+/g, "_") }));
  const guess: Partial<ColumnMapping> = {};
  const taken = new Set<string>();
  const fields = Object.entries(HEADER_HINTS) as [keyof ColumnMapping, string[]][];

  function assign(field: keyof ColumnMapping, raw: string) {
    guess[field] = raw;
    taken.add(raw);
  }

  // Pass 1, exact matches only, walking each field's hints in priority
  // order -- so a file containing both "id" and "entry_id" maps entryId to
  // "entry_id", regardless of which column comes first.
  for (const [field, hints] of fields) {
    for (const hint of hints) {
      const match = normalized.find((h) => h.key === hint && !taken.has(h.raw));
      if (match) {
        assign(field, match.raw);
        break;
      }
    }
  }

  // Pass 2, looser matches for whatever is still unmapped, skipping columns
  // already claimed above -- otherwise "product_id" would satisfy entryId's
  // "id" hint in a file that has no fill identifier at all.
  for (const [field, hints] of fields) {
    if (guess[field]) continue;
    for (const hint of hints) {
      const match = normalized.find((h) => matchesLoosely(h.key, hint) && !taken.has(h.raw));
      if (match) {
        assign(field, match.raw);
        break;
      }
    }
  }

  return guess;
}
