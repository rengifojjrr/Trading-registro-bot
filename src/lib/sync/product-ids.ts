/**
 * COINBASE_PRODUCT_ID accepts either a single product or a comma-separated
 * list, so an account trading more than one contract syncs all of them.
 * It was previously read as a single string, which meant any position
 * opened on a second contract simply never appeared anywhere in the app --
 * with no error, because nothing was looking for it.
 *
 * Kept permissive about whitespace and trailing commas (env vars get
 * hand-edited in dashboards), but never invents a product: an input with
 * no usable entries returns an empty list, and the caller treats that as
 * "not configured" rather than silently syncing nothing.
 */
export function parseProductIds(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}
