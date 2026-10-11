/** Test hook for deterministic scheduling policy evaluation. */
let schedulingNowOverride: Date | null = null;

export function schedulingNow(): Date {
  return schedulingNowOverride ?? new Date();
}

export function setSchedulingNowForTests(value: Date | null): void {
  schedulingNowOverride = value;
}
