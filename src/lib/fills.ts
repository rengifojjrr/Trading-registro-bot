/**
 * How many allocated fills a trade page renders at once.
 *
 * The fill history is an audit trail, so it is never silently truncated:
 * when a trade has more than this, the table says how many are missing and
 * points at the CSV export, which has no limit. The cap exists because the
 * section is folded by default and a scalping trade can allocate thousands
 * of fills -- paying for all of them on every page load, for a panel most
 * visits never open, is the wrong trade.
 */
export const MAX_FILLS_RENDERED = 200;
