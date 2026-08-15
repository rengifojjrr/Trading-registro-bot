"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 5_000;
/** After this long without a successful read, a displayed price stops being "live". */
const STALE_AFTER_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;

export type CurrentPriceStatus = "loading" | "ok" | "stale" | "unavailable";

export interface CurrentPrice {
  price: number | null;
  status: CurrentPriceStatus;
  /** Milliseconds since the last successful read. Null before the first one. */
  ageMs: number | null;
}

/**
 * Polls /api/coinbase/current-price for one product. Shared by every "live"
 * widget so there's exactly one polling implementation to get right.
 *
 * Two behaviours matter more than the polling itself:
 *
 * - **Backoff.** A failing endpoint used to be hit every five seconds
 *   forever. Consecutive failures now widen the interval up to a minute,
 *   so a Coinbase outage doesn't turn into a self-inflicted rate limit.
 *
 * - **Staleness.** The previous version kept showing the last price it ever
 *   read, with nothing to say it was minutes old. A number labelled "ahora"
 *   that is silently frozen is worse than no number, so the status goes
 *   `stale` and callers can say so.
 */
export function useCurrentPrice(productId: string): CurrentPrice {
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<CurrentPriceStatus>("loading");
  const [ageMs, setAgeMs] = useState<number | null>(null);
  const lastSuccessRef = useRef<number | null>(null);

  const markStale = useCallback(() => {
    const last = lastSuccessRef.current;
    if (last === null) return;
    const age = Date.now() - last;
    setAgeMs(age);
    if (age > STALE_AFTER_MS) setStatus("stale");
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    async function poll() {
      try {
        const res = await fetch(`/api/coinbase/current-price?productId=${encodeURIComponent(productId)}`);
        const data = (await res.json()) as { price: number | null };
        if (cancelled) return;

        if (data.price === null) {
          failures += 1;
          // No price is a real answer (product unknown, Coinbase not
          // configured), not a transport error -- but it still shouldn't be
          // asked for every five seconds forever.
          if (lastSuccessRef.current === null) setStatus("unavailable");
          else markStale();
        } else {
          failures = 0;
          lastSuccessRef.current = Date.now();
          setPrice(data.price);
          setAgeMs(0);
          setStatus("ok");
        }
      } catch {
        if (cancelled) return;
        failures += 1;
        if (lastSuccessRef.current === null) setStatus("unavailable");
        else markStale();
      } finally {
        if (!cancelled) {
          // Exponential backoff on consecutive failures, capped so the
          // widget still recovers on its own once Coinbase answers again.
          const delay = Math.min(POLL_INTERVAL_MS * 2 ** Math.min(failures, 4), MAX_BACKOFF_MS);
          timer = setTimeout(poll, failures === 0 ? POLL_INTERVAL_MS : delay);
        }
      }
    }

    void poll();
    // Separate ticker so the age (and therefore the stale label) keeps
    // updating even while a request is in flight or backed off.
    const ageTimer = setInterval(markStale, 5_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(ageTimer);
    };
  }, [productId, markStale]);

  return { price, status, ageMs };
}
