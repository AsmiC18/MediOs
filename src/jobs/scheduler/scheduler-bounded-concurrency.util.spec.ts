import { mapWithBoundedConcurrency } from './scheduler-bounded-concurrency.util';

describe('mapWithBoundedConcurrency', () => {
  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await mapWithBoundedConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    );

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('collects errors without stopping other workers', async () => {
    const errors = await mapWithBoundedConcurrency(
      ['ok', 'fail', 'ok2'],
      2,
      async (value) => {
        if (value === 'fail') {
          throw new Error('failed item');
        }
      },
    );

    expect(errors).toHaveLength(1);
  });
});
