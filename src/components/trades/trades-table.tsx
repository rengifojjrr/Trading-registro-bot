"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TradeTableRow } from "@/lib/analytics/queries";
import type { TradeSortKey } from "@/lib/analytics/trade-sort";
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

/**
 * Sorting, searching and paging all live in the URL and are executed by
 * Postgres -- this component renders exactly the page it was handed.
 *
 * It used to receive every matching row and do all three in the browser,
 * which meant a full history transfer on every page load. Keeping the
 * state in the URL also makes a sorted/filtered view shareable and
 * survivable across a refresh, which client state was not.
 */
export function TradesTable({
  rows,
  total,
  page,
  pageSize,
  sortKey,
  sortDir,
  search,
  accountsById,
  timezone,
  onExport,
}: {
  rows: TradeTableRow[];
  total: number;
  page: number;
  pageSize: number;
  sortKey: TradeSortKey;
  sortDir: "asc" | "desc";
  search: string;
  accountsById: Record<string, string>;
  timezone: string;
  /** Exports every matching row, not just this page -- see the trades page. */
  onExport: () => Promise<TradeTableRow[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(search);
  const [isExporting, setIsExporting] = useState(false);

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const tradeWord = (n: number) => `${n} operaci${n === 1 ? "ón" : "ones"}`;

  function toggleSort(key: TradeSortKey) {
    const nextDir = key === sortKey && sortDir === "desc" ? "asc" : "desc";
    // Any re-sort returns to the first page: staying on page 4 of a
    // differently-ordered list shows rows the user never asked for.
    setParams({ sort: key, dir: nextDir, page: null });
  }

  function submitSearch(value: string) {
    setParams({ q: value || null, page: null });
  }

  async function exportCsv() {
    setIsExporting(true);
    try {
      const allRows = await onExport();
      const Papa = (await import("papaparse")).default;
      const csv = Papa.unparse(
        allRows.map((r) => ({
          fecha_apertura: r.opened_at,
          fecha_cierre: r.closed_at,
          producto: r.product_id,
          cuenta: accountsById[r.account_id] ?? r.account_id,
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
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(searchDraft.trim());
          }}
          className="flex w-full gap-2 sm:w-auto"
        >
          <Input
            placeholder="Buscar por producto…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className="w-full sm:w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            Buscar
          </Button>
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchDraft("");
                submitSearch("");
              }}
            >
              Limpiar
            </Button>
          ) : null}
        </form>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExporting}>
          <Download className="size-4" aria-hidden />
          {isExporting ? "Exportando…" : "Exportar CSV"}
        </Button>
      </div>

      {/* Below md the ten-column table forced a 960px-wide horizontal drag
          on a ~390px screen. Same rows, same order, rendered as cards --
          the table itself is simply not shown at that width. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.length === 0 ? (
          <li className="rounded-lg border border-border px-3 py-10 text-center text-sm text-muted-foreground">
            Ninguna operación coincide.
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/trades/${row.id}`}
                className="flex flex-col gap-1.5 rounded-lg border border-border p-3 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{row.direction === "LONG" ? "Long" : "Short"}</Badge>
                    <span className="font-medium">{row.product_id}</span>
                  </div>
                  <span className={cn("font-medium tabular-nums", pnlColorClass(row.net_pnl))}>
                    {formatSignedMoney(row.net_pnl)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">{formatDate(row.opened_at, timezone)}</span>
                  <Badge variant={row.status === "OPEN" ? "warning" : "outline"}>
                    {row.status === "OPEN" ? "Abierta" : "Cerrada"}
                  </Badge>
                  <span className="tabular-nums">{formatPercent(row.return_pct)}</span>
                  <span className="tabular-nums">{formatDuration(row.duration_seconds)}</span>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <SortableHeader label="Apertura" sortKey="opened_at" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Producto" sortKey="product_id" current={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2 font-medium">Cuenta</th>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                  Ninguna operación coincide.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                  <td className="px-3 py-2 tabular-nums">
                    <Link href={`/trades/${row.id}`} className="hover:underline">
                      {formatDate(row.opened_at, timezone)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.product_id}</td>
                  <td className="px-3 py-2">{accountsById[row.account_id] ?? row.account_id}</td>
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
        <span>{tradeWord(total)}</span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <span>
              Página {page + 1} de {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setParams({ page: page <= 1 ? null : String(page - 1) })}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setParams({ page: String(page + 1) })}
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
  sortKey: TradeSortKey;
  current: TradeSortKey;
  dir: "asc" | "desc";
  onSort: (key: TradeSortKey) => void;
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
