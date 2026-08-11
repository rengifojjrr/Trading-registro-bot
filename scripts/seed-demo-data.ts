/**
 * Seeds ONE demo account with realistic, clearly-marked-as-demo data so the
 * dashboard has something to render before any real Coinbase connection
 * exists. Every row this script writes is tagged is_demo=true (accounts)
 * or source='DEMO_SEED' (trades) -- see docs/DATABASE.md -- and nothing
 * else in the app is allowed to set those values, so demo data can never
 * be mistaken for real trading history.
 *
 * The four scenarios (simple long, simple short, multi-entry/multi-exit
 * long, long->short reversal) are the exact fixtures in
 * src/lib/coinbase/venues/mock.ts. The trade summaries below were computed
 * by hand against those fills using the same weighted-average-price and
 * pro-rated-commission rules the reconstruction engine will implement in
 * Phase 3 -- this script is deliberately NOT a preview of that engine
 * (it doesn't exist yet), just numbers a human worked out from the same
 * raw fills, so Phase 3's engine has something independently-computed to
 * check itself against.
 *
 * Usage: npm run seed:demo -- <account-owner-email>
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see
 * .env.example). Run only against a project you're comfortable seeding
 * demo data into -- this writes real rows via the service-role key.
 */

import { createClient } from "@supabase/supabase-js";

import { MOCK_FILLS, MOCK_PRODUCT } from "../src/lib/coinbase/venues/mock";
import { classifySession } from "../src/lib/sessions/classify";
import type { Database } from "../src/types/database";

const DEMO_PORTFOLIO_ID = "demo-portfolio";
const DEMO_ACCOUNT_NAME = "Cuenta demo (datos simulados)";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: npm run seed:demo -- <email-del-usuario>");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno. Copia .env.example a .env.local y complétalo.",
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const user = await findUserByEmail(supabase, email);
  if (!user) {
    console.error(`No se encontró ningún usuario con el correo "${email}". Créalo primero (ver README).`);
    process.exit(1);
  }

  console.log(`Sembrando datos demo para ${email} (${user.id})…`);

  await supabase.from("products").upsert(
    {
      product_id: MOCK_PRODUCT.product_id,
      venue: MOCK_PRODUCT.product_venue ?? "FCM",
      product_type: MOCK_PRODUCT.product_type,
      base_currency_id: MOCK_PRODUCT.base_currency_id,
      quote_currency_id: MOCK_PRODUCT.quote_currency_id,
      contract_size: MOCK_PRODUCT.future_product_details?.contract_size,
      contract_root_unit: MOCK_PRODUCT.future_product_details?.contract_root_unit,
      contract_expiry_type: MOCK_PRODUCT.future_product_details?.contract_expiry_type,
      contract_expiry: MOCK_PRODUCT.future_product_details?.contract_expiry,
      risk_managed_by: MOCK_PRODUCT.future_product_details?.risk_managed_by,
      display_name: MOCK_PRODUCT.display_name,
      raw_metadata: MOCK_PRODUCT as unknown as Database["public"]["Tables"]["products"]["Row"]["raw_metadata"],
    },
    { onConflict: "product_id" },
  );

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .upsert(
      {
        user_id: user.id,
        portfolio_id: DEMO_PORTFOLIO_ID,
        venue: "FCM",
        name: DEMO_ACCOUNT_NAME,
        is_demo: true,
        is_active: true,
      },
      { onConflict: "user_id,portfolio_id,venue" },
    )
    .select("id")
    .single();

  if (accountError || !account) {
    throw new Error(`No se pudo crear la cuenta demo: ${accountError?.message}`);
  }

  const orderIds = [...new Set(MOCK_FILLS.map((f) => f.order_id))];
  await supabase.from("raw_orders").upsert(
    orderIds.map((orderId) => {
      const sample = MOCK_FILLS.find((f) => f.order_id === orderId)!;
      return {
        order_id: orderId,
        user_id: user.id,
        account_id: account.id,
        product_id: sample.product_id,
        order_side: sample.side,
        status: "FILLED",
        raw_payload: { demo: true, order_id: orderId },
        fetched_at: new Date().toISOString(),
      };
    }),
    { onConflict: "order_id" },
  );

  await supabase.from("raw_fills").upsert(
    MOCK_FILLS.map((f) => ({
      entry_id: f.entry_id,
      user_id: user.id,
      account_id: account.id,
      order_id: f.order_id,
      product_id: f.product_id,
      coinbase_trade_id: f.trade_id,
      trade_time: f.trade_time,
      sequence_timestamp: f.sequence_timestamp,
      trade_type: f.trade_type,
      side: f.side,
      price: f.price,
      size: f.size,
      commission: f.commission,
      liquidity_indicator: f.liquidity_indicator,
      size_in_quote: f.size_in_quote,
      raw_payload: f as unknown as Database["public"]["Tables"]["raw_fills"]["Row"]["raw_payload"],
    })),
    { onConflict: "entry_id" },
  );

  const contractSize = Number(MOCK_PRODUCT.future_product_details!.contract_size);

  type TradeSeed = {
    openingFillId: string;
    direction: "LONG" | "SHORT";
    status: "OPEN" | "CLOSED";
    openedAt: string;
    closedAt: string | null;
    entryWap: number;
    exitWap: number | null;
    maxSize: number;
    totalEntryQty: number;
    totalExitQty: number;
    entryCommissions: number;
    exitCommissions: number;
    entriesCount: number;
    exitsCount: number;
    fills: { rawFillId: string; role: "ENTRY" | "EXIT"; allocatedSize: number; allocatedCommission: number; sequenceNo: number }[];
  };

  const tradeSeeds: TradeSeed[] = [
    {
      // Scenario 1: simple long, full close.
      openingFillId: "demo-entry-1",
      direction: "LONG",
      status: "CLOSED",
      openedAt: fillById("demo-entry-1").trade_time,
      closedAt: fillById("demo-entry-2").trade_time,
      entryWap: 61200.0,
      exitWap: 61850.0,
      maxSize: 3,
      totalEntryQty: 3,
      totalExitQty: 3,
      entryCommissions: 1.8,
      exitCommissions: 1.86,
      entriesCount: 1,
      exitsCount: 1,
      fills: [
        { rawFillId: "demo-entry-1", role: "ENTRY", allocatedSize: 3, allocatedCommission: 1.8, sequenceNo: 1 },
        { rawFillId: "demo-entry-2", role: "EXIT", allocatedSize: 3, allocatedCommission: 1.86, sequenceNo: 2 },
      ],
    },
    {
      // Scenario 2: simple short, full close.
      openingFillId: "demo-entry-3",
      direction: "SHORT",
      status: "CLOSED",
      openedAt: fillById("demo-entry-3").trade_time,
      closedAt: fillById("demo-entry-4").trade_time,
      entryWap: 62400.0,
      exitWap: 62050.0,
      maxSize: 5,
      totalEntryQty: 5,
      totalExitQty: 5,
      entryCommissions: 3.0,
      exitCommissions: 2.95,
      entriesCount: 1,
      exitsCount: 1,
      fills: [
        { rawFillId: "demo-entry-3", role: "ENTRY", allocatedSize: 5, allocatedCommission: 3.0, sequenceNo: 1 },
        { rawFillId: "demo-entry-4", role: "EXIT", allocatedSize: 5, allocatedCommission: 2.95, sequenceNo: 2 },
      ],
    },
    {
      // Scenario 3: two partial entries, two partial exits.
      openingFillId: "demo-entry-5",
      direction: "LONG",
      status: "CLOSED",
      openedAt: fillById("demo-entry-5").trade_time,
      closedAt: fillById("demo-entry-8").trade_time,
      entryWap: 63020.0, // (63000*2 + 63040*2) / 4
      exitWap: 63460.0, // (63500*2 + 63420*2) / 4
      maxSize: 4,
      totalEntryQty: 4,
      totalExitQty: 4,
      entryCommissions: 2.4,
      exitCommissions: 2.54,
      entriesCount: 2,
      exitsCount: 2,
      fills: [
        { rawFillId: "demo-entry-5", role: "ENTRY", allocatedSize: 2, allocatedCommission: 1.2, sequenceNo: 1 },
        { rawFillId: "demo-entry-6", role: "ENTRY", allocatedSize: 2, allocatedCommission: 1.2, sequenceNo: 2 },
        { rawFillId: "demo-entry-7", role: "EXIT", allocatedSize: 2, allocatedCommission: 1.27, sequenceNo: 3 },
        { rawFillId: "demo-entry-8", role: "EXIT", allocatedSize: 2, allocatedCommission: 1.27, sequenceNo: 4 },
      ],
    },
    {
      // Scenario 4a: long closed by the first 2 contracts of the reversal fill.
      openingFillId: "demo-entry-9",
      direction: "LONG",
      status: "CLOSED",
      openedAt: fillById("demo-entry-9").trade_time,
      closedAt: fillById("demo-entry-10").trade_time,
      entryWap: 64100.0,
      exitWap: 63780.0,
      maxSize: 2,
      totalEntryQty: 2,
      totalExitQty: 2,
      entryCommissions: 1.28,
      exitCommissions: 1.276, // 3.19 * 2/5, pro-rated by allocated size
      entriesCount: 1,
      exitsCount: 1,
      fills: [
        { rawFillId: "demo-entry-9", role: "ENTRY", allocatedSize: 2, allocatedCommission: 1.28, sequenceNo: 1 },
        { rawFillId: "demo-entry-10", role: "EXIT", allocatedSize: 2, allocatedCommission: 1.276, sequenceNo: 2 },
      ],
    },
    {
      // Scenario 4b: the reversal's leftover 3 contracts open a new, still-open short.
      openingFillId: "demo-entry-10",
      direction: "SHORT",
      status: "OPEN",
      openedAt: fillById("demo-entry-10").trade_time,
      closedAt: null,
      entryWap: 63780.0,
      exitWap: null,
      maxSize: 3,
      totalEntryQty: 3,
      totalExitQty: 0,
      entryCommissions: 1.914, // 3.19 * 3/5
      exitCommissions: 0,
      entriesCount: 1,
      exitsCount: 0,
      fills: [
        { rawFillId: "demo-entry-10", role: "ENTRY", allocatedSize: 3, allocatedCommission: 1.914, sequenceNo: 1 },
      ],
    },
  ];

  for (const seed of tradeSeeds) {
    const grossPnl =
      seed.exitWap == null
        ? null
        : seed.direction === "LONG"
          ? (seed.exitWap - seed.entryWap) * seed.totalExitQty * contractSize
          : (seed.entryWap - seed.exitWap) * seed.totalExitQty * contractSize;
    const totalCommissions = seed.entryCommissions + seed.exitCommissions;
    const netPnl = grossPnl == null ? null : grossPnl - totalCommissions;
    const notionalValue = seed.entryWap * seed.totalEntryQty * contractSize;
    const returnPct = netPnl == null ? null : (netPnl / notionalValue) * 100;

    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .upsert(
        {
          user_id: user.id,
          account_id: account.id,
          product_id: MOCK_PRODUCT.product_id,
          opening_fill_id: seed.openingFillId,
          direction: seed.direction,
          status: seed.status,
          opened_at: seed.openedAt,
          closed_at: seed.closedAt,
          max_size: seed.maxSize,
          total_entry_qty: seed.totalEntryQty,
          total_exit_qty: seed.totalExitQty,
          entry_wap: seed.entryWap,
          exit_wap: seed.exitWap,
          contract_multiplier: contractSize,
          notional_value: notionalValue,
          entry_commissions: seed.entryCommissions,
          exit_commissions: seed.exitCommissions,
          gross_pnl: grossPnl,
          net_pnl: netPnl,
          return_pct: returnPct,
          entries_count: seed.entriesCount,
          exits_count: seed.exitsCount,
          reconstruction_version: 0, // 0 marks "hand-computed by the seed script", never produced by the real engine
          session_computed: classifySession(seed.openedAt),
          source: "DEMO_SEED",
        },
        { onConflict: "account_id,product_id,opening_fill_id" },
      )
      .select("id")
      .single();

    if (tradeError || !trade) {
      throw new Error(`No se pudo crear el trade demo (${seed.openingFillId}): ${tradeError?.message}`);
    }

    await supabase.from("trade_fills").upsert(
      seed.fills.map((f) => ({
        user_id: user.id,
        trade_id: trade.id,
        raw_fill_id: f.rawFillId,
        role: f.role,
        allocated_size: f.allocatedSize,
        allocated_commission: f.allocatedCommission,
        sequence_no: f.sequenceNo,
      })),
      { onConflict: "raw_fill_id,role" },
    );
  }

  console.log(`Listo: ${tradeSeeds.length} operaciones demo creadas para ${email}.`);
}

function fillById(entryId: string) {
  const found = MOCK_FILLS.find((f) => f.entry_id === entryId);
  if (!found) throw new Error(`Fixture fill "${entryId}" not found in MOCK_FILLS`);
  return found;
}

async function findUserByEmail(
  supabase: ReturnType<typeof createClient<Database>>,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
