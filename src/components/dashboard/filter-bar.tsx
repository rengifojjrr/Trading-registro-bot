"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SESSION_LABELS_ES } from "@/lib/format";
import type { SessionLabel } from "@/types/database";

const ALL = "ALL";

const SESSION_OPTIONS = Object.entries(SESSION_LABELS_ES) as [SessionLabel, string][];

/**
 * Every filter here lives in the URL, not client state -- the dashboard
 * page (a Server Component) reads searchParams and re-fetches/re-computes
 * every stat, chart, and the calendar from the same filtered query, so
 * changing a filter can never leave one part of the screen showing a
 * different slice of data than another (the spec's "filtros coherentes"
 * requirement).
 */
export function FilterBar({ accounts }: { accounts: { id: string; name: string }[] }) {
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
  const direction = searchParams.get("direction") ?? ALL;
  const status = searchParams.get("status") ?? ALL;
  const session = searchParams.get("session") ?? ALL;
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const hasActiveFilters = [accountId, direction, status, session].some((v) => v !== ALL) || dateFrom || dateTo;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
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

      {hasActiveFilters ? (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Limpiar filtros
        </Button>
      ) : null}
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
