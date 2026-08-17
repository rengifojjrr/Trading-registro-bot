"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SyncHealth } from "@/lib/sync/freshness";
import { cn } from "@/lib/utils";

/**
 * Says out loud when the page is showing old state.
 *
 * Added after a position was closed on Coinbase and the dashboard kept
 * calling it open for five days. Nothing was computed wrong -- no sync had
 * run, so the app had never been told about the closing fill. The problem
 * was that stale state looked exactly like fresh state, which is the one
 * thing a tool built for trustworthy figures cannot do.
 *
 * Silent while everything is current: a warning shown all the time is a
 * warning nobody reads.
 */
export function SyncFreshnessBanner({ health }: { health: SyncHealth }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  if (health.freshness === "FRESH") return null;

  const severe = health.freshness === "STALE" || health.freshness === "NEVER";

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/coinbase/sync-now");
      const data = (await res.json()) as
        | { ok: true; summary: { fillsNew: number; tradesUpdated: number; tradesCreated: number } }
        | { ok: false; message: string };

      if (!data.ok) {
        toast.error(data.message);
        return;
      }

      const { fillsNew, tradesCreated, tradesUpdated } = data.summary;
      toast.success(
        fillsNew === 0
          ? "Sincronizado. Coinbase no tenía operaciones nuevas."
          : `Sincronizado: ${fillsNew} fills nuevos, ${tradesCreated} operaciones creadas, ${tradesUpdated} actualizadas.`,
      );
      // The figures on this page came from the server, so they only change
      // once it re-renders with the newly synced rows.
      router.refresh();
    } catch {
      toast.error("No se pudo contactar al servidor.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm",
        severe ? "border-warning/50 bg-warning/5" : "border-border bg-secondary/40",
      )}
    >
      <AlertTriangle
        className={cn("size-4 shrink-0", severe ? "text-warning" : "text-muted-foreground")}
        aria-hidden
      />
      <span className={severe ? "text-foreground" : "text-muted-foreground"}>{health.message}</span>
      <Button size="sm" variant={severe ? "default" : "outline"} onClick={syncNow} disabled={syncing} className="ml-auto">
        {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw className="size-4" aria-hidden />}
        Sincronizar ahora
      </Button>
    </div>
  );
}
