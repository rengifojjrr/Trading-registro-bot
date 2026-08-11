"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 15_000;

export type CurrentPriceStatus = "loading" | "ok" | "unavailable";

/**
 * Polls /api/coinbase/current-price for one product. Shared by every "live"
 * widget (the open-trade detail page card, the dashboard's open-positions
 * panel) so there's exactly one polling implementation to get right, not
 * one per call site.
 */
export function useCurrentPrice(productId: string): { price: number | null; status: CurrentPriceStatus } {
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<CurrentPriceStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/coinbase/current-price?productId=${encodeURIComponent(productId)}`);
        const data = (await res.json()) as { price: number | null };
        if (cancelled) return;
        if (data.price === null) {
          setStatus("unavailable");
        } else {
          setPrice(data.price);
          setStatus("ok");
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [productId]);

  return { price, status };
}
