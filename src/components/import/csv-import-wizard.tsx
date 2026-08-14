"use client";

import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { importCsvFills, type ImportOutcome } from "@/app/(dashboard)/import/actions";
import { InfoHint } from "@/components/shared/info-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  guessMapping,
  MAX_IMPORT_ROWS,
  parseFillRows,
  REQUIRED_MAPPING_FIELDS,
  type ColumnMapping,
} from "@/lib/csv/parse-fills";
import { cn } from "@/lib/utils";

export interface ImportAccount {
  id: string;
  name: string;
}

export interface ImportProduct {
  productId: string;
  contractSize: string | null;
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  entryId: "Identificador del fill",
  tradeTime: "Fecha y hora",
  side: "Lado (compra/venta)",
  price: "Precio",
  size: "Cantidad",
  commission: "Comisión",
  productId: "Producto",
  orderId: "Orden",
};

const FIELD_HELP: Partial<Record<keyof ColumnMapping, string>> = {
  entryId:
    "Debe ser único por ejecución. Es lo que evita importar dos veces la misma operación si vuelves a subir el archivo.",
  commission:
    "Si dejas esta columna sin asignar, se asume comisión cero. Si la asignas, cualquier valor que no sea un número detiene esa fila -- suponer cero inflaría tu ganancia.",
  productId: "Opcional: si tu archivo mezcla instrumentos. Si no, se usa el producto elegido arriba para todas las filas.",
};

const NONE = "__none__";
const NEW_PRODUCT = "__new__";

/**
 * The CSV wizard: subir -> mapear -> previsualizar -> importar.
 *
 * The preview here is exactly that -- a preview. The file's rows and the
 * confirmed mapping are what get sent to the server, which re-parses them
 * with the same function; no number computed in this component is ever
 * written to the database.
 */
export function CsvImportWizard({
  accounts,
  products,
}: {
  accounts: ImportAccount[];
  products: ImportProduct[];
}) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? NONE);
  const [productChoice, setProductChoice] = useState<string>(products[0]?.productId ?? NEW_PRODUCT);
  const [newProductId, setNewProductId] = useState("");
  const [contractSize, setContractSize] = useState("");

  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const selectedProduct = products.find((p) => p.productId === productChoice);
  const productId = productChoice === NEW_PRODUCT ? newProductId.trim() : productChoice;
  const needsContractSize = productChoice === NEW_PRODUCT || !selectedProduct?.contractSize;

  const missingFields = REQUIRED_MAPPING_FIELDS.filter((f) => !mapping[f]);
  const mappingComplete = missingFields.length === 0;

  const preview = useMemo(() => {
    if (!mappingComplete || rows.length === 0) return null;
    return parseFillRows(rows, mapping as ColumnMapping, { productId: productId || "?" });
  }, [rows, mapping, mappingComplete, productId]);

  function handleFile(file: File) {
    setFileError(null);
    setOutcome(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        const parsedRows = result.data.filter((r) => Object.values(r).some((v) => (v ?? "").trim() !== ""));
        const parsedHeaders = (result.meta.fields ?? []).filter((h) => h.trim() !== "");

        if (parsedHeaders.length === 0) {
          setFileError("El archivo no tiene una fila de encabezados con nombres de columna.");
          return;
        }
        if (parsedRows.length === 0) {
          setFileError("El archivo no tiene filas de datos.");
          return;
        }
        if (parsedRows.length > MAX_IMPORT_ROWS) {
          setFileError(
            `El archivo tiene ${parsedRows.length} filas y el máximo por importación es ${MAX_IMPORT_ROWS}. Divídelo en partes.`,
          );
          return;
        }

        setFilename(file.name);
        setHeaders(parsedHeaders);
        setRows(parsedRows);
        setMapping(guessMapping(parsedHeaders));
      },
      error: (error) => setFileError(`No se pudo leer el archivo: ${error.message}`),
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await importCsvFills({
        filename,
        accountId: accountId === NONE ? null : accountId,
        productId,
        contractSize: needsContractSize ? contractSize.trim() : undefined,
        mapping,
        rows,
      });

      setOutcome(result);
      if (result.error) toast.error(result.error);
      else if (result.imported === 0) toast.info("Nada nuevo que importar: todo el archivo ya estaba registrado.");
      else toast.success(`${result.imported} fill(s) importados.`);
    });
  }

  const canSubmit =
    mappingComplete &&
    rows.length > 0 &&
    productId !== "" &&
    (!needsContractSize || contractSize.trim() !== "") &&
    (preview?.fills.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Elige el archivo</CardTitle>
          <CardDescription>
            Un CSV con una fila por ejecución (fill), no por operación. La app agrupa los fills en operaciones
            con el mismo motor que usa la sincronización de Coinbase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="size-4" aria-hidden />
              Seleccionar CSV
            </Button>
            {filename ? (
              <span className="text-sm text-muted-foreground">
                {filename} · {rows.length} fila(s)
              </span>
            ) : null}
          </div>
          {fileError ? <p className="text-sm text-negative">{fileError}</p> : null}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Destino</CardTitle>
              <CardDescription>Dónde se guardan estas operaciones y con qué multiplicador se calcula el P&amp;L.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import_account">Cuenta</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="import_account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NONE}>Crear cuenta de importación</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import_product">Producto</Label>
                <Select value={productChoice} onValueChange={setProductChoice}>
                  <SelectTrigger id="import_product">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.productId} value={p.productId}>
                        {p.productId}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_PRODUCT}>Otro producto…</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {productChoice === NEW_PRODUCT ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import_new_product">Identificador del producto</Label>
                  <Input
                    id="import_new_product"
                    value={newProductId}
                    onChange={(e) => setNewProductId(e.target.value)}
                    placeholder="MNQ, MES, BIT-27MAR26-CDE…"
                    maxLength={64}
                  />
                </div>
              ) : null}

              {needsContractSize ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import_contract_size" className="flex items-center gap-1.5">
                    Tamaño de contrato
                    <InfoHint label="Tamaño de contrato">
                      El multiplicador real del contrato: cuánto vale un punto de movimiento. Para los nano
                      Bitcoin de Coinbase es 0.01. Sin este número el P&amp;L saldría mal por un factor
                      constante, así que la importación no continúa sin él.
                    </InfoHint>
                  </Label>
                  <Input
                    id="import_contract_size"
                    value={contractSize}
                    onChange={(e) => setContractSize(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.01"
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Asigna las columnas</CardTitle>
              <CardDescription>
                Se rellenó automáticamente a partir de los encabezados del archivo. Revísalo: un mapeo
                equivocado importa cifras equivocadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => {
                const required = (REQUIRED_MAPPING_FIELDS as readonly string[]).includes(field);
                return (
                  <div key={field} className="flex flex-col gap-1.5">
                    <Label htmlFor={`map_${field}`} className="flex items-center gap-1.5">
                      {FIELD_LABELS[field]}
                      {required ? <span className="text-negative">*</span> : null}
                      {FIELD_HELP[field] ? (
                        <InfoHint label={FIELD_LABELS[field]}>{FIELD_HELP[field]}</InfoHint>
                      ) : null}
                    </Label>
                    <Select
                      value={mapping[field] ?? NONE}
                      onValueChange={(value) =>
                        setMapping((prev) => ({ ...prev, [field]: value === NONE ? undefined : value }))
                      }
                    >
                      <SelectTrigger id={`map_${field}`}>
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Sin asignar</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Revisa antes de importar</CardTitle>
              <CardDescription>
                Nada se guarda hasta que pulses el botón. Las filas con problemas se listan aquí y se omiten.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!mappingComplete ? (
                <p className="text-sm text-muted-foreground">
                  Falta asignar: {missingFields.map((f) => FIELD_LABELS[f]).join(", ")}.
                </p>
              ) : preview ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="positive">{preview.fills.length} listos</Badge>
                    {preview.errors.length > 0 ? (
                      <Badge variant="negative">{preview.errors.length} con problemas</Badge>
                    ) : null}
                    {preview.duplicateEntryIds.length > 0 ? (
                      <Badge variant="warning">{preview.duplicateEntryIds.length} id repetidos</Badge>
                    ) : null}
                  </div>

                  {preview.fills.length > 0 ? <PreviewTable fills={preview.fills.slice(0, 5)} /> : null}

                  {preview.errors.length > 0 ? (
                    <div className="flex flex-col gap-1 rounded-md border border-negative/40 bg-negative/5 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-negative">
                        <AlertTriangle className="size-4" aria-hidden />
                        Filas que se omitirán
                      </p>
                      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {preview.errors.slice(0, 10).map((e) => (
                          <li key={`${e.row}-${e.reason}`}>
                            Fila {e.row}: {e.reason}
                          </li>
                        ))}
                      </ul>
                      {preview.errors.length > 10 ? (
                        <p className="text-xs text-muted-foreground">
                          …y {preview.errors.length - 10} más.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div>
                <Button onClick={submit} disabled={!canSubmit || isPending}>
                  {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Importar {preview?.fills.length ?? 0} fill(s)
                </Button>
              </div>

              {outcome && !outcome.error ? (
                <div className="flex flex-col gap-1 rounded-md border border-positive/40 bg-positive/5 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-positive">
                    <CheckCircle2 className="size-4" aria-hidden />
                    Importación terminada
                  </p>
                  <p className="text-muted-foreground">
                    {outcome.imported} fill(s) nuevos · {outcome.duplicates} ya estaban registrados ·{" "}
                    {outcome.tradesCreated} operación(es) creadas, {outcome.tradesUpdated} actualizadas.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function PreviewTable({ fills }: { fills: { entryId: string; tradeTime: string; side: string; price: string; size: string; commission: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Fecha (UTC)</th>
            <th className="px-3 py-2 text-left font-medium">Lado</th>
            <th className="px-3 py-2 text-right font-medium">Precio</th>
            <th className="px-3 py-2 text-right font-medium">Cantidad</th>
            <th className="px-3 py-2 text-right font-medium">Comisión</th>
          </tr>
        </thead>
        <tbody>
          {fills.map((f) => (
            <tr key={f.entryId} className="border-t border-border">
              <td className="whitespace-nowrap px-3 py-2">{f.tradeTime.replace("T", " ").slice(0, 16)}</td>
              <td className={cn("px-3 py-2", f.side === "BUY" ? "text-positive" : "text-negative")}>
                {f.side === "BUY" ? "Compra" : "Venta"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{f.price}</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.size}</td>
              <td className="px-3 py-2 text-right tabular-nums">{f.commission}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
