export class InvalidExpiryError extends Error {}

/**
 * Packaging prints an expiry as MM/YYYY, never a specific day, so a product is usable through the
 * end of the printed month. Normalizing every stored expiry to that month's final instant makes
 * "was this expired when it was used?" a direct comparison against the treatment date with no
 * off-by-one ambiguity, and it is deliberately done here — server-side — so there is exactly one
 * implementation of the rule regardless of what the client's date picker produced.
 *
 * UTC throughout: the value is a calendar fact about a package, not a moment in the clinic's local
 * time, and reading it back in another timezone must not shift it into a different month.
 */
export function normalizeExpiryToMonthEnd(value: string): Date | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidExpiryError(`Unparseable expiry date: ${value}`);
  }
  // Day 0 of the *next* month is the last day of this one, which handles February and leap years
  // without a table.
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
}
