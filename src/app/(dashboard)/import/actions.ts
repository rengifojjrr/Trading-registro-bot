"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { MAX_IMPORT_ROWS, parseFillRows, type ColumnMapping } from "@/lib/csv/parse-fills";
import { persistReconstruction } from "@/lib/reconstruction/persist";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const RECONSTRUCTION_ALGORITHM_VERSION = 1;

/**
 * The server side of the CSV wizard.
 *
 * The browser parses the file only to render a preview -- this action
 * re-parses the raw rows with the same pure function and imports *that*
 * result. Nothing computed in the browser is trusted, so a tampered or
 * simply stale preview can never write numbers that differ from what the
 * server itself derived from the file.
 *
 * Imported rows land in raw_fills and are then reconstructed by the same
 * engine the Coinbase sync uses. There is deliberately no path that writes
 * a trade directly.
 */

const mappingSchema = z.object({
  entryId: z.string().min(1),
  tradeTime: z.string().min(1),
  side: z.string().min(1),
  price: z.string().min(1),
  size: z.string().min(1),
  commission: z.string().optional(),
  productId: z.string().optional(),
  orderId: z.string().optional(),
});

const importSchema = z.object({
  filename: z.string().min(1).max(255),
  /** Null means "the user has never synced anything" -- an import account is created on the fly. */
  accountId: z.uuid().nullable(),
  productId: z.string().min(1).max(64),
  /**
   * Only used when the product has no contract size yet: either it's being
   * declared here for the first time, or it came from the Notion import,
   * which never knew the multiplier. Never overwrites a size Coinbase gave us.
   */
  contractSize: z.string().optional(),
  mapping: mappingSchema,
  rows: z.array(z.record(z.string(), z.string())).min(1).max(MAX_IMPORT_ROWS),
});

export interface ImportOutcome {
  error: string | null;
  imported: number;
  duplicates: number;
  errors: { row: number; reason: string }[];
  tradesCreated: number;
  tradesUpdated: number;
}

const EMPTY: Omit<ImportOutcome, "error"> = {
  imported: 0,
  duplicates: 0,
  errors: [],
  tradesCreated: 0,
  tradesUpdated: 0,
};

export async function importCsvFills(input: unknown): Promise<ImportOutcome> {
  try {
    return await runImport(input);
  } catch (error) {
    // Anything below can throw -- a missing service-role key, a database
    // error inside persistReconstruction. Without this, the rejection would
    // surface in the browser as an unhandled promise and the wizard would
    // just sit there looking like nothing happened.
    console.error("[import/csv] import failed", error);
    const message = error instanceof Error ? error.message : "Error desconocido.";
    return { ...EMPTY, error: `La importación falló: ${message}` };
  }
}

async function runImport(input: unknown): Promise<ImportOutcome> {
  const parsedInput = importSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ...EMPTY, error: "El archivo o el mapeo de columnas no son válidos." };
  }
  const { filename, accountId, productId, contractSize, mapping, rows } = parsedInput.data;

  const user = await requireUser();
  const supabase = await createClient();
  const admin = createAdminClient();

  const resolvedAccountId = await resolveAccountId(user.id, accountId);
  if (!resolvedAccountId) return { ...EMPTY, error: "No se pudo determinar la cuenta de destino." };

  const { data: product } = await supabase
    .from("products")
    .select("product_id, contract_size")
    .eq("product_id", productId)
    .maybeSingle();

  // Without the real contract multiplier every P&L figure would be wrong by
  // a constant factor, so the import stops here rather than guessing 1.
  const declared = product?.contract_size ?? contractSize ?? null;
  if (!declared || !isPositiveNumber(declared)) {
    return {
      ...EMPTY,
      error: "Indica el tamaño de contrato (multiplicador) del producto: sin él no se puede calcular el P&L.",
    };
  }

  if (!product) {
    const { error } = await admin.from("products").insert({
      product_id: productId,
      venue: "EXTERNAL",
      product_type: "FUTURE",
      contract_size: declared,
      display_name: productId,
      // Flagged so a later Coinbase sync, or anyone reading this row, can
      // tell the multiplier was typed by a person rather than returned by
      // the exchange.
      raw_metadata: { declared_by_user: true, declared_via: "CSV_IMPORT" } as unknown as Json,
    });
    if (error) return { ...EMPTY, error: `No se pudo registrar el producto: ${error.message}` };

    // The multiplier was typed by a person, not returned by the exchange --
    // every P&L for this product depends on it, so it gets its own entry.
    await recordAudit({
      userId: user.id,
      action: "CONTRACT_SIZE_DECLARED",
      entityType: "product",
      entityId: productId,
      metadata: { contractSize: declared, createdProduct: true },
    });
  } else if (!product.contract_size) {
    const { error } = await admin
      .from("products")
      .update({ contract_size: declared })
      .eq("product_id", productId);
    if (error) return { ...EMPTY, error: `No se pudo guardar el tamaño de contrato: ${error.message}` };

    await recordAudit({
      userId: user.id,
      action: "CONTRACT_SIZE_DECLARED",
      entityType: "product",
      entityId: productId,
      metadata: { contractSize: declared, createdProduct: false },
    });
  }

  const parsed = parseFillRows(rows, mapping as ColumnMapping, { productId });

  const { data: importRow } = await admin
    .from("csv_imports")
    .insert({
      user_id: user.id,
      account_id: resolvedAccountId,
      filename,
      column_mapping: mapping as unknown as Json,
      row_count: rows.length,
      status: "PROCESSING",
    })
    .select("id")
    .single();

  async function finish(status: "COMPLETED" | "FAILED", counts: { imported: number; duplicates: number }) {
    if (!importRow) return;
    await admin
      .from("csv_imports")
      .update({
        status,
        imported_count: counts.imported,
        duplicate_count: counts.duplicates,
        error_count: parsed.errors.length,
      })
      .eq("id", importRow.id);
  }

  if (parsed.fills.length === 0) {
    await finish("FAILED", { imported: 0, duplicates: 0 });
    return {
      ...EMPTY,
      error: "Ninguna fila del archivo se pudo importar.",
      errors: parsed.errors.slice(0, 50),
    };
  }

  // Fills already in the database are skipped, never overwritten: raw_fills
  // is append-only, and a re-uploaded file must be a no-op rather than a
  // second copy of the same history.
  const entryIds = parsed.fills.map((f) => f.entryId);
  const existingIds = new Set<string>();
  for (let i = 0; i < entryIds.length; i += 500) {
    const { data } = await admin
      .from("raw_fills")
      .select("entry_id")
      .in("entry_id", entryIds.slice(i, i + 500));
    for (const r of data ?? []) existingIds.add(r.entry_id);
  }

  const toInsert = parsed.fills.filter((f) => !existingIds.has(f.entryId));
  const duplicates = parsed.fills.length - toInsert.length;

  if (toInsert.length > 0) {
    const { error: insertError } = await admin.from("raw_fills").insert(
      toInsert.map((f) => ({
        entry_id: f.entryId,
        user_id: user.id,
        account_id: resolvedAccountId,
        // Left null on purpose: raw_fills.order_id is a foreign key into
        // raw_orders, and a CSV gives us an order identifier without the
        // order itself. The value is preserved in raw_payload instead of
        // being turned into a fabricated raw_orders row.
        order_id: null,
        product_id: productId,
        trade_time: f.tradeTime,
        sequence_timestamp: f.tradeTime,
        trade_type: "FILL",
        side: f.side,
        price: f.price,
        size: f.size,
        commission: f.commission,
        // No sync_run_id: this fill did not come from a Coinbase sync run.
        // persistReconstruction reads that absence to label the resulting
        // trades CSV_IMPORT.
        sync_run_id: null,
        raw_payload: {
          source: "CSV_IMPORT",
          filename,
          csv_import_id: importRow?.id ?? null,
          order_id: f.orderId,
        } as unknown as Json,
      })),
    );

    if (insertError) {
      await finish("FAILED", { imported: 0, duplicates });
      return { ...EMPTY, error: `No se pudieron guardar los fills: ${insertError.message}` };
    }
  }

  const result = await persistReconstruction({
    userId: user.id,
    accountId: resolvedAccountId,
    productId,
    contractSize: declared,
    algorithmVersion: RECONSTRUCTION_ALGORITHM_VERSION,
  });

  await finish("COMPLETED", { imported: toInsert.length, duplicates });

  await recordAudit({
    userId: user.id,
    action: "CSV_IMPORTED",
    entityType: "csv_import",
    entityId: importRow?.id,
    metadata: {
      filename,
      productId,
      imported: toInsert.length,
      duplicates,
      errors: parsed.errors.length,
    },
  });

  revalidatePath("/import");
  revalidatePath("/trades");
  revalidatePath("/");

  return {
    error: null,
    imported: toInsert.length,
    duplicates,
    errors: parsed.errors.slice(0, 50),
    tradesCreated: result.tradesCreated,
    tradesUpdated: result.tradesUpdated,
  };
}

function isPositiveNumber(value: string): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * Confirms the chosen account belongs to this user, or creates the import
 * account for someone who has never connected Coinbase -- the CSV path has
 * to work standalone, since one of its jobs is being the fallback when the
 * API isn't available.
 */
async function resolveAccountId(userId: string, requested: string | null): Promise<string | null> {
  const supabase = await createClient();

  if (requested) {
    // RLS on the user-scoped client is what actually enforces ownership here.
    const { data } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", requested)
      .eq("user_id", userId)
      .maybeSingle();
    return data?.id ?? null;
  }

  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_demo", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await createAdminClient()
    .from("accounts")
    .insert({
      user_id: userId,
      portfolio_id: "csv-import",
      venue: "EXTERNAL",
      name: "Importación CSV",
      is_demo: false,
      is_active: true,
    })
    .select("id")
    .single();

  return created?.id ?? null;
}
