/**
 * Backfills historical trades from the user's Notion "Trading Journal"
 * database into this platform, as `trades` + `journal_entries` + `accounts`
 * + `products` + `strategies` + `tags`, all tagged `source='NOTION_IMPORT'`
 * / `venue='EXTERNAL'` so they're never confused with real Coinbase data.
 *
 * This is a one-time/on-demand backfill tool, not a live sync path -- see
 * docs/NOTION_IMPORT.md for the full rationale behind every field-mapping
 * decision below (why "Setup" becomes a tag instead of a strategy, why a
 * multi-ticker row gets a synthetic combined product, why entry/exit prices
 * recorded as 0 are treated as "not recorded" rather than a real price,
 * etc). That doc also lists exactly which fields have no structured home in
 * this schema and are folded into journal_entries.notes instead, verbatim,
 * so nothing from the original journal is silently dropped.
 *
 * Idempotent: pages already linked in notion_import_links (by
 * notion_page_id) are skipped on every subsequent run, so re-running after
 * adding new rows to the Notion database only imports what's new.
 *
 * Usage: npm run import:notion -- <account-owner-email>
 * Requires (see .env.example): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, NOTION_API_TOKEN, NOTION_DATABASE_ID.
 */

import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";

import type { Database, Json } from "../src/types/database";

// -- Notion property parsing -------------------------------------------
// Minimal, schema-specific readers -- this script is written against the
// exact "📈 Trading Journal" schema, not a generic Notion-database importer.

interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, unknown>;
}

function prop(page: NotionPage, name: string): Record<string, unknown> | undefined {
  return page.properties[name] as Record<string, unknown> | undefined;
}

function getNumber(page: NotionPage, name: string): number | null {
  const p = prop(page, name);
  const v = p?.number;
  return typeof v === "number" ? v : null;
}

function getSelect(page: NotionPage, name: string): string | null {
  const p = prop(page, name);
  const sel = p?.select as { name?: string } | null | undefined;
  return sel?.name ?? null;
}

function getStatus(page: NotionPage, name: string): string | null {
  const p = prop(page, name);
  const status = p?.status as { name?: string } | null | undefined;
  return status?.name ?? null;
}

function getMultiSelect(page: NotionPage, name: string): string[] {
  const p = prop(page, name);
  const arr = p?.multi_select as Array<{ name?: string }> | undefined;
  return (arr ?? []).map((o) => o.name).filter((n): n is string => Boolean(n));
}

function getDateStart(page: NotionPage, name: string): string | null {
  const p = prop(page, name);
  const date = p?.date as { start?: string } | null | undefined;
  return date?.start ?? null;
}

function getRichText(page: NotionPage, name: string): string | null {
  const p = prop(page, name);
  const arr = p?.rich_text as Array<{ plain_text?: string }> | undefined;
  const text = (arr ?? []).map((t) => t.plain_text ?? "").join("");
  return text.length > 0 ? text : null;
}

function getFilesCount(page: NotionPage, name: string): number {
  const p = prop(page, name);
  const arr = p?.files as unknown[] | undefined;
  return arr?.length ?? 0;
}

function nonZero(v: number | null): number | null {
  return v === null || v === 0 ? null : v;
}

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// -- Main -----------------------------------------------------------------

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: npm run import:notion -- <email-del-usuario>");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const notionToken = process.env.NOTION_API_TOKEN;
  const notionDatabaseId = process.env.NOTION_DATABASE_ID;
  if (!supabaseUrl || !serviceRoleKey || !notionToken || !notionDatabaseId) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_API_TOKEN y/o NOTION_DATABASE_ID. Copia .env.example a .env.local y complétalo.",
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const notion = new Client({ auth: notionToken });

  const { data: user, error: userError } = await supabase.auth.admin
    .listUsers({ page: 1, perPage: 200 })
    .then((res) => ({
      data: res.data.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase()) ?? null,
      error: res.error,
    }));
  if (userError) throw new Error(`No se pudo listar usuarios: ${userError.message}`);
  if (!user) {
    console.error(`No se encontró ningún usuario con el correo "${email}".`);
    process.exit(1);
  }
  const userId = user.id;

  const database = await notion.databases.retrieve({ database_id: notionDatabaseId });
  const dataSourceId = (database as { data_sources?: Array<{ id: string }> }).data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error("La base de datos de Notion no tiene ningún data source.");

  console.log(`Consultando el data source ${dataSourceId} de Notion…`);
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor, page_size: 100 });
    for (const page of res.results) {
      if ("properties" in page) pages.push(page as unknown as NotionPage);
    }
    cursor = res.next_cursor ?? undefined;
  } while (cursor);
  console.log(`${pages.length} páginas encontradas.`);

  const { data: existingLinks } = await supabase
    .from("notion_import_links")
    .select("notion_page_id")
    .eq("user_id", userId);
  const alreadyImported = new Set((existingLinks ?? []).map((l) => l.notion_page_id));

  const accountIdByCuenta = new Map<string, string>();
  const productIdByKey = new Map<string, true>();
  const strategyIdByName = new Map<string, string>();
  const tagIdByName = new Map<string, string>();

  async function ensureAccount(cuenta: string): Promise<string> {
    const cached = accountIdByCuenta.get(cuenta);
    if (cached) return cached;
    const { data, error } = await supabase
      .from("accounts")
      .upsert(
        {
          user_id: userId,
          portfolio_id: `notion-import:${slug(cuenta)}`,
          venue: "EXTERNAL",
          name: cuenta,
          is_demo: false,
          is_active: true,
        },
        { onConflict: "user_id,portfolio_id,venue" },
      )
      .select("id")
      .single();
    if (error || !data) throw new Error(`No se pudo crear la cuenta "${cuenta}": ${error?.message}`);
    accountIdByCuenta.set(cuenta, data.id);
    return data.id;
  }

  async function ensureProduct(tickers: string[]): Promise<string> {
    const productId = `${tickers.map(slug).join("+").toUpperCase()}-EXTERNAL`;
    if (!productIdByKey.has(productId)) {
      const { error } = await supabase.from("products").upsert(
        {
          product_id: productId,
          venue: "EXTERNAL",
          product_type: "FUTURE",
          display_name: tickers.join(" + "),
          raw_metadata: { source: "notion_import", original_tickers: tickers } as unknown as Json,
        },
        { onConflict: "product_id" },
      );
      if (error) throw new Error(`No se pudo crear el producto "${productId}": ${error.message}`);
      productIdByKey.set(productId, true);
    }
    return productId;
  }

  async function ensureStrategy(name: string): Promise<string> {
    const cached = strategyIdByName.get(name);
    if (cached) return cached;
    const { data, error } = await supabase
      .from("strategies")
      .upsert({ user_id: userId, name, is_active: true }, { onConflict: "user_id,name" })
      .select("id")
      .single();
    if (error || !data) throw new Error(`No se pudo crear la estrategia "${name}": ${error?.message}`);
    strategyIdByName.set(name, data.id);
    return data.id;
  }

  async function ensureTag(name: string): Promise<string> {
    const cached = tagIdByName.get(name);
    if (cached) return cached;
    const { data, error } = await supabase
      .from("tags")
      .upsert({ user_id: userId, name }, { onConflict: "user_id,name" })
      .select("id")
      .single();
    if (error || !data) throw new Error(`No se pudo crear la etiqueta "${name}": ${error?.message}`);
    tagIdByName.set(name, data.id);
    return data.id;
  }

  let imported = 0;
  let skippedAlready = 0;
  let skippedIncomplete = 0;
  let multiTickerCount = 0;
  let zeroPriceCount = 0;
  let contradictionCount = 0;
  let fileCount = 0;

  for (const page of pages) {
    const notionPageId = page.id;
    if (alreadyImported.has(notionPageId)) {
      skippedAlready += 1;
      continue;
    }

    const resultado = getStatus(page, "Resultado");
    let status: "OPEN" | "CLOSED";
    if (resultado && ["Ganador", "Perdedor", "Break-even"].includes(resultado)) status = "CLOSED";
    else if (resultado && ["Abierto", "Parcial"].includes(resultado)) status = "OPEN";
    else {
      skippedIncomplete += 1;
      continue;
    }

    const cuenta = getSelect(page, "Cuenta");
    const tickers = getMultiSelect(page, "Ticker");
    const fecha = getDateStart(page, "Fecha");
    if (!cuenta || tickers.length === 0 || !fecha) {
      skippedIncomplete += 1;
      continue;
    }

    const direction: "LONG" | "SHORT" = getSelect(page, "Dirección") === "Short" ? "SHORT" : "LONG";
    const accountId = await ensureAccount(cuenta);
    const productId = await ensureProduct(tickers);

    const openedAt = `${fecha}T00:00:00Z`;
    const closedAt = status === "CLOSED" ? openedAt : null;

    const entryPrice = nonZero(getNumber(page, "Entrada"));
    const exitPrice = status === "CLOSED" ? nonZero(getNumber(page, "Salida")) : null;
    const size = getNumber(page, "Tamaño") ?? 0;
    const commissions = getNumber(page, "Comisiones") ?? 0;
    const netPnl = getNumber(page, "PnL");
    const grossPnl = netPnl === null ? null : netPnl + commissions;
    const notional = entryPrice !== null ? entryPrice * size : null;
    const returnPct = notional && netPnl !== null ? (netPnl / notional) * 100 : null;

    const estrategias = getMultiSelect(page, "Estrategia").filter(
      (e) => !["ninguna", "ninguno"].includes(e.toLowerCase()),
    );
    const strategyId = estrategias.length > 0 ? await ensureStrategy(estrategias[0]) : null;
    const extraStrategies = estrategias.slice(1);

    const emociones = getMultiSelect(page, "Emociones").join(", ") || null;
    const errores = getMultiSelect(page, "Errores").join(", ") || null;
    const trend = getMultiSelect(page, "trend ").join(", ") || null;
    const stopLoss = nonZero(getNumber(page, "Stop Loss"));
    const takeProfit = nonZero(getNumber(page, "Take Profit"));
    const resultR = getNumber(page, "R múltiplo");

    const noteLines: string[] = [];
    const notas = getRichText(page, "Notas");
    const revision = getRichText(page, "Revisión post-trade");
    const puntuacion = getNumber(page, "Puntuación ");
    const donde = getRichText(page, "Donde ?");
    const seleccionar = getSelect(page, "Seleccionar");
    if (notas) noteLines.push(`Notas (Notion): ${notas}`);
    if (revision) noteLines.push(`Revisión post-trade (Notion): ${revision}`);
    if (puntuacion !== null) noteLines.push(`Puntuación (Notion, escala 0-10): ${puntuacion}`);
    if (donde) noteLines.push(`Dónde: ${donde}`);
    if (seleccionar) noteLines.push(`Contexto (Notion "Seleccionar"): ${seleccionar}`);
    if (extraStrategies.length > 0) noteLines.push(`Otras estrategias etiquetadas en Notion: ${extraStrategies.join(", ")}`);

    const capturas = getFilesCount(page, "Capturas");
    const planFiles = getFilesCount(page, "Plan pre-mercado");
    if (capturas > 0 || planFiles > 0) {
      fileCount += capturas + planFiles;
      noteLines.push(
        `⚠ ${capturas} captura(s) y ${planFiles} archivo(s) de plan pre-mercado en Notion no migrados todavía a esta plataforma -- ver la página original.`,
      );
    }
    if (tickers.length > 1) {
      multiTickerCount += 1;
      noteLines.push(
        `⚠ Notion registraba varios tickers en una sola fila (${tickers.join(", ")}); el precio de entrada/salida no distingue entre ellos -- revisar y, si corresponde, separar manualmente.`,
      );
    }
    if (entryPrice === null || (status === "CLOSED" && exitPrice === null)) {
      zeroPriceCount += 1;
      noteLines.push(`⚠ Precio de entrada y/o salida no estaban registrados en Notion (aparecían como 0) -- no se importó un precio para ese campo.`);
    }
    const pnlSign = netPnl === null ? null : netPnl > 0 ? "Ganador" : netPnl < 0 ? "Perdedor" : "Break-even";
    if (pnlSign && resultado !== pnlSign) {
      contradictionCount += 1;
      noteLines.push(
        `⚠ El PnL registrado en Notion (${netPnl}) no concuerda con el resultado marcado (${resultado}) -- se conservó el PnL numérico tal cual estaba en Notion; revisar manualmente.`,
      );
    }
    noteLines.push(
      `Nota de metodología: el P&L neto es el que venía registrado en Notion; el P&L bruto se estima sumándole las comisiones registradas, ya que Notion no distingue precio "sucio" vs. neto.`,
    );
    noteLines.push(`Importado desde Notion: ${page.url}`);

    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .insert({
        user_id: userId,
        account_id: accountId,
        product_id: productId,
        opening_fill_id: null,
        direction,
        status,
        opened_at: openedAt,
        closed_at: closedAt,
        max_size: size,
        total_entry_qty: size,
        total_exit_qty: status === "CLOSED" ? size : 0,
        entry_wap: entryPrice,
        exit_wap: exitPrice,
        notional_value: notional,
        contract_multiplier: 1,
        entry_commissions: commissions,
        exit_commissions: 0,
        gross_pnl: grossPnl,
        net_pnl: netPnl,
        return_pct: returnPct,
        entries_count: 1,
        exits_count: status === "CLOSED" ? 1 : 0,
        is_manually_adjusted: false,
        session_computed: null,
        session_override: null,
        source: "NOTION_IMPORT",
      })
      .select("id")
      .single();
    if (tradeError || !trade) throw new Error(`No se pudo crear el trade para ${page.url}: ${tradeError?.message}`);

    await supabase.from("journal_entries").insert({
      user_id: userId,
      trade_id: trade.id,
      strategy_id: strategyId,
      htf_bias: trend,
      sr_proximity: null,
      planned_direction: "NONE",
      risk_amount: null,
      stop_loss_price: stopLoss,
      take_profit_price: takeProfit,
      result_r: resultR,
      plan_adherence: null,
      entry_quality: null,
      emotional_state: emociones,
      mistake_tag: errores,
      lesson_learned: null,
      notes: noteLines.join("\n\n"),
    });

    for (const s of getMultiSelect(page, "Setup")) {
      const tagId = await ensureTag(`Setup: ${s}`);
      await supabase.from("trade_tags").upsert({ user_id: userId, trade_id: trade.id, tag_id: tagId });
    }

    await supabase.from("notion_import_links").insert({
      user_id: userId,
      trade_id: trade.id,
      notion_page_id: notionPageId,
      notion_database_id: notionDatabaseId,
      raw_properties: page.properties as unknown as Json,
    });

    imported += 1;
  }

  if (imported > 0) {
    const message = `Se importaron ${imported} operación(es) nueva(s) desde tu Trading Journal de Notion. Detalles: ${multiTickerCount} con varios tickers combinados en una fila, ${zeroPriceCount} con precio de entrada/salida sin registrar, ${contradictionCount} con el PnL y el resultado marcados de forma inconsistente en Notion, y ${fileCount} archivo(s) adjuntos (capturas/plan pre-mercado) que no se migraron todavía y solo existen en la página original de Notion. Nada de esto se ocultó ni se corrigió automáticamente -- revisa las notas de cada operación marcada.`;
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "DISCREPANCY",
      severity: "INFO",
      title: "Importación de Notion completada con observaciones",
      message,
      related_entity_type: "notion_import",
      dedup_key: `NOTION_IMPORT:run:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  console.log(
    `Listo. Importadas: ${imported}. Ya importadas antes (omitidas): ${skippedAlready}. Incompletas/no ejecutadas (omitidas): ${skippedIncomplete}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
