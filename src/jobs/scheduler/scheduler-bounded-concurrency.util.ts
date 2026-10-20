/** Runs async work over items with at most `concurrency` in flight at once. */
export async function mapWithBoundedConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<unknown[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const errors: unknown[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) {
        return;
      }
      try {
        await fn(items[current], current);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return errors;
}
