import { ReportProjectionService } from './report-projection.service';
import { ReportProjectionBillingHookService } from './report-projection-billing-hook.service';

/** Bypasses projection cache in unit/integration tests. */
export function createPassThroughReportProjectionService(): ReportProjectionService {
  return {
    getReadLayerId: () => 'report-projection-table',
    getFreshProjection: async () => null,
    upsertProjection: async () => ({}),
    getOrCompute: async (
      _key: unknown,
      _maxAgeMs: number,
      compute: () => Promise<unknown>,
    ) => compute(),
  } as unknown as ReportProjectionService;
}

export function createNoopReportProjectionBillingHook(): ReportProjectionBillingHookService {
  return {
    onBillingReportAffectingMutation: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReportProjectionBillingHookService;
}
