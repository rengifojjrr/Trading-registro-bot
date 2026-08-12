"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SESSION_LABELS_ES, SOURCE_LABELS_ES } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionLabel, TradeSource } from "@/types/database";

const ALL = "ALL";

const SESSION_OPTIONS = Object.entries(SESSION_LABELS_ES) as [SessionLabel, string][];
const SOURCE_OPTIONS = Object.entries(SOURCE_LABELS_ES) as [TradeSource, string][];

/**
 * Every filter here lives in the URL, not client state -- the dashboard
 * page (a Server Component) reads searchParams and re-fetches/re-computes
 * every stat, chart, and the calendar from the same filtered query, so
 * changing a filter can never leave one part of the screen showing a
 * different slice of data than another (the spec's "filtros coherentes"
 * requirement). Shared by the Dashboard and Operaciones pages for the same
 * reason -- a product/source/P&L filter set on one must carry over to the
 * other, not silently reset.
 */
export function FilterBar({
  accounts,
  products,
}: {
  accounts: { id: string; name: string }[];
  products: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const clearAll = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  const accountId = searchParams.get("accountId") ?? ALL;
  const productId = searchParams.get("productId") ?? ALL;
  const direction = searchParams.get("direction") ?? ALL;
  const status = searchParams.get("status") ?? ALL;
  const session = searchParams.get("session") ?? ALL;
  const source = searchParams.get("source") ?? ALL;
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const netPnlMin = searchParams.get("netPnlMin") ?? "";
  const netPnlMax = searchParams.get("netPnlMax") ?? "";

  const activeFilterCount =
    [accountId, productId, direction, status, session, source].filter((v) => v !== ALL).length +
    [dateFrom, dateTo, netPnlMin, netPnlMax].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;

  // Collapsed by default on mobile (md:flex below always wins at desktop
  // widths, so this toggle only affects small screens) -- but starts
  // expanded if the URL already carries filters, so arriving with a
  // filtered link never hides *why* the results look filtered. Ten
  // fixed-width fields wrapping onto ~5-6 stacked rows was the concrete
  // mobile complaint this fixes.
  const [isExpanded, setIsExpanded] = useState(hasActiveFilters);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center justify-between gap-2 md:hidden"
        aria-expanded={isExpanded}
      >
        <span className="text-sm font-medium text-foreground">
          Filtros{hasActiveFilters ? ` (${activeFilterCount})` : ""}
        </span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
          aria-hidden
        />
      </button>

      <div className={cn("flex-wrap items-end gap-3", isExpanded ? "flex" : "hidden md:flex")}>
        <FilterField label="Cuenta">
          <Select value={accountId} onValueChange={(v) => setParam("accountId", v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        {products.length > 1 ? (
          <FilterField label="Producto">
            <Select value={productId} onValueChange={(v) => setParam("productId", v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        ) : null}

        <FilterField label="Dirección">
          <Select value={direction} onValueChange={(v) => setParam("direction", v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              <SelectItem value="LONG">Long</SelectItem>
              <SelectItem value="SHORT">Short</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Estado">
          <Select value={status} onValueChange={(v) => setParam("status", v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              <SelectItem value="OPEN">Abiertas</SelectItem>
              <SelectItem value="CLOSED">Cerradas</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Origen">
          <Select value={source} onValueChange={(v) => setParam("source", v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {SOURCE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Sesión">
          <Select value={session} onValueChange={(v) => setParam("session", v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {SESSION_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Desde">
          <Input
            type="date"
            className="w-36"
            value={dateFrom}
            onChange={(e) => setParam("dateFrom", e.target.value || null)}
          />
        </FilterField>

        <FilterField label="Hasta">
          <Input
            type="date"
            className="w-36"
            value={dateTo}
            onChange={(e) => setParam("dateTo", e.target.value || null)}
          />
        </FilterField>

        <FilterField label="P&L mín">
          <Input
            type="number"
            step="any"
            placeholder="Sin mínimo"
            className="w-28"
            value={netPnlMin}
            onChange={(e) => setParam("netPnlMin", e.target.value || null)}
          />
        </FilterField>

        <FilterField label="P&L máx">
          <Input
            type="number"
            step="any"
            placeholder="Sin máximo"
            className="w-28"
            value={netPnlMax}
            onChange={(e) => setParam("netPnlMax", e.target.value || null)}
          />
        </FilterField>

        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
