import { PatientAtRiskStatus } from '@prisma/client';
import {
  computePatientAtRiskEvaluation,
  DEFAULT_AT_RISK_CADENCE_MULTIPLIER,
  INSUFFICIENT_HISTORY_SUGGESTED_ACTION,
  NOT_AT_RISK_SUGGESTED_ACTION,
} from './patient-at-risk-evaluation.util';

describe('computePatientAtRiskEvaluation', () => {
  const evaluatedAt = new Date('2026-03-01T12:00:00.000Z');

  it('returns INSUFFICIENT_HISTORY when fewer than 2 completed visits', () => {
    const result = computePatientAtRiskEvaluation({
      completedVisitStartAts: [new Date('2026-01-01T10:00:00.000Z')],
      evaluatedAt,
    });

    expect(result.atRiskStatus).toBe(PatientAtRiskStatus.INSUFFICIENT_HISTORY);
    expect(result.isAtRisk).toBe(false);
    expect(result.suggestedAction).toBe(INSUFFICIENT_HISTORY_SUGGESTED_ACTION);
    expect(result.daysSinceLastVisit).toBeNull();
    expect(result.averageVisitCadenceDays).toBeNull();
  });

  it('returns INSUFFICIENT_HISTORY when there are zero visits', () => {
    const result = computePatientAtRiskEvaluation({
      completedVisitStartAts: [],
      evaluatedAt,
    });

    expect(result.atRiskStatus).toBe(PatientAtRiskStatus.INSUFFICIENT_HISTORY);
  });

  it('computes cadence from exactly two visits', () => {
    const result = computePatientAtRiskEvaluation({
      completedVisitStartAts: [
        new Date('2026-01-01T10:00:00.000Z'),
        new Date('2026-01-31T10:00:00.000Z'),
      ],
      evaluatedAt: new Date('2026-02-15T10:00:00.000Z'),
    });

    expect(result.averageVisitCadenceDays).toBe(30);
    expect(result.daysSinceLastVisit).toBe(15);
    expect(result.isAtRisk).toBe(false);
    expect(result.atRiskStatus).toBe(PatientAtRiskStatus.NOT_AT_RISK);
    expect(result.suggestedAction).toBe(NOT_AT_RISK_SUGGESTED_ACTION);
  });

  it('averages gaps across multiple visits', () => {
    const result = computePatientAtRiskEvaluation({
      completedVisitStartAts: [
        new Date('2026-01-01T10:00:00.000Z'),
        new Date('2026-01-11T10:00:00.000Z'),
        new Date('2026-01-31T10:00:00.000Z'),
      ],
      evaluatedAt: new Date('2026-02-01T10:00:00.000Z'),
    });

    expect(result.averageVisitCadenceDays).toBe(15);
    expect(result.daysSinceLastVisit).toBe(1);
  });

  it('uses strict > for threshold (exact threshold is NOT_AT_RISK)', () => {
    const result = computePatientAtRiskEvaluation({
      completedVisitStartAts: [
        new Date('2026-01-01T10:00:00.000Z'),
        new Date('2026-01-31T10:00:00.000Z'),
      ],
      evaluatedAt: new Date('2026-03-16T10:00:00.000Z'),
      cadenceMultiplier: DEFAULT_AT_RISK_CADENCE_MULTIPLIER,
    });

    expect(result.averageVisitCadenceDays).toBe(30);
    expect(result.daysSinceLastVisit).toBe(44);
    expect(result.isAtRisk).toBe(false);
    expect(result.atRiskStatus).toBe(PatientAtRiskStatus.NOT_AT_RISK);
  });

  it('marks AT_RISK when days since last visit exceed threshold', () => {
    const result = computePatientAtRiskEvaluation({
      completedVisitStartAts: [
        new Date('2026-01-01T10:00:00.000Z'),
        new Date('2026-01-31T10:00:00.000Z'),
      ],
      evaluatedAt: new Date('2026-03-18T10:00:00.000Z'),
    });

    expect(result.isAtRisk).toBe(true);
    expect(result.atRiskStatus).toBe(PatientAtRiskStatus.AT_RISK);
    expect(result.suggestedAction).toContain('Schedule follow-up');
    expect(result.suggestedAction).toContain('46 days');
    expect(result.suggestedAction).toContain('typical cadence: 30 days');
  });

  it('marks NOT_AT_RISK when below threshold', () => {
    const result = computePatientAtRiskEvaluation({
      completedVisitStartAts: [
        new Date('2026-01-01T10:00:00.000Z'),
        new Date('2026-01-31T10:00:00.000Z'),
      ],
      evaluatedAt: new Date('2026-02-20T10:00:00.000Z'),
    });

    expect(result.isAtRisk).toBe(false);
    expect(result.suggestedAction).toBe(NOT_AT_RISK_SUGGESTED_ACTION);
  });
});
