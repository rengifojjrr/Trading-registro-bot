"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TradeTableRow } from "@/lib/analytics/queries";
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatSessionLabel,
  formatSignedMoney,
  pnlColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type DecoratedRow = TradeTableRow & { account_name: string };

type SortKey =
  | "opened_at"
  | "product_id"
  | "account_name"
  | "max_size"
  | "net_pnl"
  | "return_pct"
  | "duration_seconds";

/**
 * Client-side sort/search/pagination/export over an already server-filtered
 * (account/direction/status/session/date-range) row set -- see the shared
 * FilterBar on the trades page. Hand-rolled rather than a table library:
 * this app's whole trade history realistically stays in the hundreds to low
 * thousands of rows, well within what plain array sort/filter handles, and
 * it keeps the table free of a large dependency's API surface.
 */
export function TradesTable({
  rows,
  accountsById,
  timezone,
}: {
  rows: TradeTableRow[];
  accountsById: Record<string, string>;
  timezone: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("opened_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const decorated = useMemo<DecoratedRow[]>(
    () => rows.map((r) => ({ ...r, account_name: accountsById[r.account_id] ?? r.account_id })),
    [rows, accountsById],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return decorated;
    return decorated.filter((r) =>
      [r.product_id, r.account_name, r.direction, r.status, r.session_effective, r.source]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [decorated, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compareValues(a[sortKey], b[sortKey]) * (sortDir === "asc" ? 1 : -1));
    return copy;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const tradeWord = (n: number) => `${n} operaci${n === 1 ? "ón" : "ones"}`;

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  function exportCsv() {
    const csv = Papa.unparse(
      sorted.map((r) => ({
        fecha_apertura: r.opened_at,
        fecha_cierre: r.closed_at,
        producto: r.product_id,
        cuenta: r.account_name,
        direccion: r.direction,
        estado: r.status,
        tamano_max: r.max_size,
        entrada_wap: r.entry_wap,
        salida_wap: r.exit_wap,
        comisiones: r.total_commissions,
        pnl_bruto: r.gross_pnl,
        pnl_neto: r.net_pnl,
        retorno_pct: r.return_pct,
        sesion: r.session_effective,
        origen: r.source,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Buscar por producto, cuenta, dirección…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-full sm:w-72"
        />
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="size-4" aria-hidden />
          Exportar CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <SortableHeader label="Apertura" sortKey="opened_at" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Producto" sortKey="product_id" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Cuenta" sortKey="account_name" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2 font-medium">Dirección</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <SortableHeader
                label="Tamaño máx"
                sortKey="max_size"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="P&L neto"
                sortKey="net_pnl"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Retorno"
                sortKey="return_pct"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Duración"
                sortKey="duration_seconds"
                current={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <th className="px-3 py-2 font-medium">Sesión</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                  Ningún trade coincide con la búsqueda.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/trades/${row.id}`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/40"
                >
                  <td className="px-3 py-2 tabular-nums">
                    <Link
                      href={`/trades/${row.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formatDate(row.opened_at, timezone)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.product_id}</td>
                  <td className="px-3 py-2">{row.account_name}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{row.direction === "LONG" ? "Long" : "Short"}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={row.status === "OPEN" ? "warning" : "outline"}>
                      {row.status === "OPEN" ? "Abierta" : "Cerrada"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.max_size, 4)}</td>
                  <td className={cn("px-3 py-2 text-right font-medium tabular-nums", pnlColorClass(row.net_pnl))}>
                    {formatSignedMoney(row.net_pnl)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", pnlColorClass(row.return_pct))}>
                    {formatPercent(row.return_pct)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDuration(row.duration_seconds)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatSessionLabel(row.session_effective)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{tradeWord(sorted.length)}</span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <span>
              Página {safePage + 1} de {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = current === sortKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-3 py-2 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 outline-none hover:text-foreground focus-visible:text-foreground",
          align === "right" && "flex-row-reverse",
          isActive && "text-foreground",
        )}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </th>
  );
}

function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  const an = typeof a === "number" ? a : Number(a);
  const bn = typeof b === "number" ? b : Number(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}
