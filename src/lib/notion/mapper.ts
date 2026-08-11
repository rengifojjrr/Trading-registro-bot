/**
 * No `import "server-only"` here on purpose (same reasoning as
 * lib/coinbase/jwt.ts): this module is pure data transformation -- trade/
 * journal rows in, a Notion properties object out. It never reads
 * process.env, calls the network, or touches a secret, so it has no
 * secret-leakage boundary of its own; that guard belongs at the call site
 * that actually holds Notion credentials (lib/notion/sync.ts, which already
 * carries it). Keeping this file guard-free lets it be unit tested
 * directly with Vitest (mapper.test.ts), which doesn't run inside Next.js's
 * RSC bundling step where `server-only` enforces its check.
 */

import type { CreatePageParameters } from "@notionhq/client";
import { Decimal } from "decimal.js";

import type { Database } from "@/types/database";

type TradeRow = Database["public"]["Tables"]["trades"]["Row"];
type JournalEntryRow = Database["public"]["Tables"]["journal_entries"]["Row"];

type NotionProperties = NonNullable<CreatePageParameters["properties"]>;
type NotionPropertyValue = NotionProperties[string];

export interface MapperInput {
  trade: TradeRow;
  journalEntry: JournalEntryRow | null;
  accountName: string;
  productDisplayName: string;
  /** internal_field names the user has explicitly disabled via notion_field_mappings. Everything else is written. */
  disabledFields: Set<string>;
}

export interface NotionFieldMapping {
  internalField: string;
  notionPropertyName: string;
  notionPropertyType: string;
  label: string;
}

/**
 * One entry per internal_field this mapper's `set()` calls below actually
 * write (everything except "title" -- a Notion page always needs its title
 * property, so that one is never user-toggleable). This is the single
 * source of truth for the Settings > Notion field-mappings UI (see
 * components/settings/notion-field-mappings.tsx): it lists which Notion
 * property each field targets and lets the user disable individual fields
 * via notion_field_mappings.enabled, which buildNotionProperties already
 * respects through `disabledFields`.
 *
 * Deliberately NOT used to drive the property names inside
 * buildNotionProperties itself -- those stay hardcoded literals so this
 * display-only manifest can never desync the actual, already-working sync
 * payload if the two drift apart. mapper.test.ts cross-checks that every
 * name here matches a real key buildNotionProperties produces.
 */
export const NOTION_FIELD_MAPPINGS: NotionFieldMapping[] = [
  { internalField: "opened_at", notionPropertyName: "Fecha", notionPropertyType: "date", label: "Fecha de apertura" },
  { internalField: "product_id", notionPropertyName: "Ticker", notionPropertyType: "multi_select", label: "Producto" },
  { internalField: "direction", notionPropertyName: "Dirección", notionPropertyType: "select", label: "Dirección" },
  { internalField: "entry_wap", notionPropertyName: "Entrada", notionPropertyType: "number", label: "Precio de entrada" },
  { internalField: "exit_wap", notionPropertyName: "Salida", notionPropertyType: "number", label: "Precio de salida" },
  { internalField: "max_size", notionPropertyName: "Tamaño", notionPropertyType: "number", label: "Tamaño" },
  {
    internalField: "total_commissions",
    notionPropertyName: "Comisiones",
    notionPropertyType: "number",
    label: "Comisiones",
  },
  { internalField: "net_pnl", notionPropertyName: "PnL", notionPropertyType: "number", label: "P&L neto" },
  { internalField: "account_id", notionPropertyName: "Cuenta", notionPropertyType: "select", label: "Cuenta" },
  { internalField: "product_type", notionPropertyName: "Mercado", notionPropertyType: "select", label: "Mercado" },
  { internalField: "status", notionPropertyName: "Resultado", notionPropertyType: "status", label: "Resultado" },
  { internalField: "result_r", notionPropertyName: "R múltiplo", notionPropertyType: "number", label: "Resultado en R" },
  {
    internalField: "stop_loss_price",
    notionPropertyName: "Stop Loss",
    notionPropertyType: "number",
    label: "Stop loss planeado",
  },
  {
    internalField: "take_profit_price",
    notionPropertyName: "Take Profit",
    notionPropertyType: "number",
    label: "Take profit planeado",
  },
  {
    internalField: "emotional_state",
    notionPropertyName: "Emociones",
    notionPropertyType: "multi_select",
    label: "Emociones",
  },
  { internalField: "mistake_tag", notionPropertyName: "Errores", notionPropertyType: "multi_select", label: "Errores" },
  { internalField: "htf_bias", notionPropertyName: "trend ", notionPropertyType: "multi_select", label: "Sesgo HTF" },
  { internalField: "notes", notionPropertyName: "Notas", notionPropertyType: "rich_text", label: "Notas" },
];

/**
 * Builds the Notion "properties" payload for creating/updating a page in
 * the same "📈 Trading Journal" shape the historical import read from (see
 * docs/NOTION_IMPORT.md) -- so a trade looks the same in Notion whether it
 * originated there or came from Coinbase. Only ever called for the
 * outbound mirror; never used to decide anything inside the app itself.
 *
 * Multi-select/select values that don't already exist as options in the
 * target Notion database are created automatically by Notion on write --
 * this mapper never needs to know the database's exact configured option
 * list ahead of time.
 */
export function buildNotionProperties(input: MapperInput): NotionProperties {
  const { trade, journalEntry, accountName, productDisplayName, disabledFields } = input;
  const props: NotionProperties = {};

  const set = (internalField: string, notionProperty: string, value: NotionPropertyValue) => {
    if (disabledFields.has(internalField)) return;
    props[notionProperty] = value;
  };

  const title = `${trade.direction === "LONG" ? "+" : "-"}${formatNum(trade.net_pnl)}`;
  set("title", "Trade", { title: [{ text: { content: title } }] });

  set("opened_at", "Fecha", { date: { start: trade.opened_at.slice(0, 10) } });
  set("product_id", "Ticker", { multi_select: splitTickers(productDisplayName).map((name) => ({ name })) });
  set("direction", "Dirección", { select: { name: trade.direction === "LONG" ? "Long" : "Short" } });
  set("entry_wap", "Entrada", { number: toNumberOrNull(trade.entry_wap) });
  set("exit_wap", "Salida", { number: toNumberOrNull(trade.exit_wap) });
  set("max_size", "Tamaño", { number: toNumberOrNull(trade.max_size) });
  set("total_commissions", "Comisiones", { number: toNumberOrNull(trade.total_commissions) });
  set("net_pnl", "PnL", { number: toNumberOrNull(trade.net_pnl) });
  set("account_id", "Cuenta", { select: { name: accountName } });
  set("product_type", "Mercado", { select: { name: "Futuros" } });
  set("status", "Resultado", { status: { name: resultadoFor(trade) } });

  if (journalEntry) {
    set("result_r", "R múltiplo", { number: toNumberOrNull(journalEntry.result_r) });
    set("stop_loss_price", "Stop Loss", { number: toNumberOrNull(journalEntry.stop_loss_price) });
    set("take_profit_price", "Take Profit", { number: toNumberOrNull(journalEntry.take_profit_price) });
    set("emotional_state", "Emociones", {
      multi_select: splitList(journalEntry.emotional_state).map((name) => ({ name })),
    });
    set("mistake_tag", "Errores", { multi_select: splitList(journalEntry.mistake_tag).map((name) => ({ name })) });
    set("htf_bias", "trend ", { multi_select: splitList(journalEntry.htf_bias).map((name) => ({ name })) });
    set("notes", "Notas", { rich_text: journalEntry.notes ? [{ text: { content: truncate(journalEntry.notes) } }] : [] });
  }

  return props;
}

function resultadoFor(trade: TradeRow): string {
  if (trade.status === "OPEN") return "Abierto";
  const pnl = trade.net_pnl === null ? null : new Decimal(trade.net_pnl);
  if (!pnl) return "Abierto";
  if (pnl.gt(0)) return "Ganador";
  if (pnl.lt(0)) return "Perdedor";
  return "Break-even";
}

function formatNum(v: string | null): string {
  if (v === null) return "0";
  return new Decimal(v).toFixed(0);
}

function toNumberOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitTickers(displayName: string): string[] {
  return displayName
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Notion rich_text blocks cap at 2000 characters per block.
function truncate(text: string): string {
  return text.length > 2000 ? `${text.slice(0, 1997)}...` : text;
}
