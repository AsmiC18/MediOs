/** UTC calendar month bounds for report projection refresh jobs. */
export function utcMonthBounds(reference: Date): { periodFrom: Date; periodTo: Date } {
  const periodFrom = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const periodTo = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { periodFrom, periodTo };
}
