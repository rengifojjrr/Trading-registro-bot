import { PageHeader } from "@/components/layout/page-header";
import { CsvImportWizard, type ImportAccount, type ImportProduct } from "@/components/import/csv-import-wizard";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { ImportHistory } from "./import-history";

/**
 * CSV import. Exists for the history that predates the Coinbase connection,
 * and as the fallback when the API is unavailable -- so it deliberately
 * works without any Coinbase credentials configured.
 */
export default async function ImportPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: accounts }, { data: products }, { data: settings }, { data: imports }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_demo", false)
      .order("created_at", { ascending: true }),
    supabase.from("products").select("product_id, contract_size").order("product_id"),
    supabase.from("app_settings").select("timezone").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("csv_imports")
      .select("id, filename, row_count, imported_count, duplicate_count, error_count, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const importAccounts: ImportAccount[] = (accounts ?? []).map((a) => ({ id: a.id, name: a.name }));
  const importProducts: ImportProduct[] = (products ?? []).map((p) => ({
    productId: p.product_id,
    contractSize: p.contract_size,
  }));

  return (
    <>
      <PageHeader
        title="Importar histórico"
        description="Sube un CSV de ejecuciones. Se agrupan en operaciones con el mismo motor que usa la sincronización de Coinbase, así que el P&L se calcula de una sola manera."
      />

      <CsvImportWizard accounts={importAccounts} products={importProducts} />

      <ImportHistory imports={imports ?? []} timezone={settings?.timezone || "UTC"} />
    </>
  );
}
