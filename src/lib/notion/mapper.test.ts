import { describe, expect, it } from "vitest";

import { buildNotionProperties, NOTION_FIELD_MAPPINGS } from "./mapper";
import type { Database } from "@/types/database";

type TradeRow = Database["public"]["Tables"]["trades"]["Row"];
type JournalEntryRow = Database["public"]["Tables"]["journal_entries"]["Row"];

const trade: TradeRow = {
  id: "trade-1",
  user_id: "user-1",
  account_id: "account-1",
  product_id: "BIT-27MAR26-CDE",
  opening_fill_id: "fill-1",
  direction: "LONG",
  status: "CLOSED",
  opened_at: "2026-08-01T00:00:00Z",
  closed_at: "2026-08-01T01:00:00Z",
  duration_seconds: 3600,
  max_size: "1",
  total_entry_qty: "1",
  total_exit_qty: "1",
  entry_wap: "64000",
  exit_wap: "64500",
  notional_value: "640",
  contract_multiplier: "0.01",
  entry_commissions: "0.5",
  exit_commissions: "0.5",
  total_commissions: "1",
  gross_pnl: "5",
  net_pnl: "4",
  return_pct: "0.78",
  entries_count: 1,
  exits_count: 1,
  reconstruction_version: 1,
  is_manually_adjusted: false,
  orphaned_at: null,
  session_computed: "NEW_YORK",
  session_override: null,
  session_effective: "NEW_YORK",
  source: "COINBASE_SYNC",
  bot_id: null,
  liquidated_qty: "0",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T01:00:00Z",
};

const journalEntry: JournalEntryRow = {
  id: "journal-1",
  user_id: "user-1",
  trade_id: "trade-1",
  strategy_id: null,
  htf_bias: "Alcista",
  sr_proximity: null,
  planned_direction: "LONG",
  risk_amount: "10",
  stop_loss_price: "63500",
  take_profit_price: "65000",
  result_r: "2",
  plan_adherence: 5,
  entry_quality: 4,
  emotional_state: "Calma, Confianza",
  mistake_tag: "ninguno",
  lesson_learned: "Nada nuevo.",
  notes: "Operación de prueba.",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T01:00:00Z",
};

describe("NOTION_FIELD_MAPPINGS", () => {
  it("every manifest entry's notionPropertyName matches a real key buildNotionProperties writes", () => {
    const props = buildNotionProperties({
      trade,
      journalEntry,
      accountName: "Cuenta principal",
      productDisplayName: "BIT",
      disabledFields: new Set(),
    });

    for (const mapping of NOTION_FIELD_MAPPINGS) {
      expect(Object.keys(props), `missing Notion property for internal_field "${mapping.internalField}"`).toContain(
        mapping.notionPropertyName,
      );
    }
  });

  it("has no duplicate internalField or notionPropertyName entries", () => {
    const internalFields = NOTION_FIELD_MAPPINGS.map((m) => m.internalField);
    const propertyNames = NOTION_FIELD_MAPPINGS.map((m) => m.notionPropertyName);
    expect(new Set(internalFields).size).toBe(internalFields.length);
    expect(new Set(propertyNames).size).toBe(propertyNames.length);
  });
});

describe("buildNotionProperties disabledFields", () => {
  it("omits exactly the disabled field's property, leaving every other property untouched", () => {
    const baseline = buildNotionProperties({
      trade,
      journalEntry,
      accountName: "Cuenta principal",
      productDisplayName: "BIT",
      disabledFields: new Set(),
    });
    const withNetPnlDisabled = buildNotionProperties({
      trade,
      journalEntry,
      accountName: "Cuenta principal",
      productDisplayName: "BIT",
      disabledFields: new Set(["net_pnl"]),
    });

    expect(baseline).toHaveProperty("PnL");
    expect(withNetPnlDisabled).not.toHaveProperty("PnL");

    const { PnL: _omitted, ...restOfBaseline } = baseline;
    expect(withNetPnlDisabled).toMatchObject(restOfBaseline);
  });
});
