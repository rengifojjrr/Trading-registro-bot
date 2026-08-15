"use client";

import { useEffect, useState } from "react";

/**
 * State that survives a reload, for view preferences that are the user's
 * own habit rather than data -- table density, panel folds, chart toggles.
 *
 * Deliberately starts from `fallback` on the very first render and only
 * adopts the stored value in an effect: reading localStorage during render
 * makes the server and the client disagree, and React replaces the whole
 * subtree when they do. The one-frame flash is the cost of never shipping
 * a hydration mismatch.
 */
export function usePersistedState<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      // The sanctioned exception to the no-setState-in-effect rule:
      // localStorage cannot be read during render without desynchronising
      // the server and client markup, so adopting the stored value after
      // mount is the only correct order.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null && isValid(stored)) setValue(stored);
    } catch {
      // Private browsing, or storage disabled entirely. The fallback is a
      // perfectly good answer -- a preference is not worth an error.
    }
    // `isValid` is a stable module-level predicate at every call site;
    // including it would re-read storage on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function update(next: T) {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // Same as above -- the in-memory value still works for this session.
    }
  }

  return [value, update];
}
