/**
 * Reporting read layer: persisted {@link ReportProjection} rows populated by
 * {@link ReportProjectionService} so heavy aggregates are not recomputed on every request.
 */
export const REPORTING_READ_LAYER = 'report-projection-table' as const;
