import { PatientAtRiskStatus } from '@prisma/client';

export const DEFAULT_AT_RISK_CADENCE_MULTIPLIER = 1.5;

export const INSUFFICIENT_HISTORY_SUGGESTED_ACTION =
  'Insufficient completed visit history for at-risk assessment';

export const NOT_AT_RISK_SUGGESTED_ACTION =
  'Continue routine follow-up based on historical visit cadence';

export function calculateDaysBetweenUtcDates(start: Date, end: Date): number {
  const startUtc = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );

  return Math.round((endUtc - startUtc) / 86400000);
}

export type PatientAtRiskEvaluationResult = {
  isAtRisk: boolean;
  atRiskStatus: PatientAtRiskStatus;
  suggestedAction: string;
  daysSinceLastVisit: number | null;
  averageVisitCadenceDays: number | null;
};

export function computePatientAtRiskEvaluation(input: {
  completedVisitStartAts: Date[];
  evaluatedAt: Date;
  cadenceMultiplier?: number;
}): PatientAtRiskEvaluationResult {
  const cadenceMultiplier =
    input.cadenceMultiplier ?? DEFAULT_AT_RISK_CADENCE_MULTIPLIER;
  const visitDates = [...input.completedVisitStartAts].sort(
    (a, b) => a.getTime() - b.getTime(),
  );

  if (visitDates.length < 2) {
    return {
      isAtRisk: false,
      atRiskStatus: PatientAtRiskStatus.INSUFFICIENT_HISTORY,
      suggestedAction: INSUFFICIENT_HISTORY_SUGGESTED_ACTION,
      daysSinceLastVisit: null,
      averageVisitCadenceDays: null,
    };
  }

  const gaps: number[] = [];
  for (let index = 1; index < visitDates.length; index += 1) {
    gaps.push(
      calculateDaysBetweenUtcDates(
        visitDates[index - 1],
        visitDates[index],
      ),
    );
  }

  const averageVisitCadenceDays =
    gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const lastVisitDate = visitDates[visitDates.length - 1];
  const daysSinceLastVisit = calculateDaysBetweenUtcDates(
    lastVisitDate,
    input.evaluatedAt,
  );
  const thresholdDays = averageVisitCadenceDays * cadenceMultiplier;
  const isAtRisk = daysSinceLastVisit > thresholdDays;

  const suggestedAction = isAtRisk
    ? `Schedule follow-up; ${daysSinceLastVisit} days since last completed visit (typical cadence: ${Math.round(averageVisitCadenceDays)} days)`
    : NOT_AT_RISK_SUGGESTED_ACTION;

  return {
    isAtRisk,
    atRiskStatus: isAtRisk
      ? PatientAtRiskStatus.AT_RISK
      : PatientAtRiskStatus.NOT_AT_RISK,
    suggestedAction,
    daysSinceLastVisit,
    averageVisitCadenceDays,
  };
}
