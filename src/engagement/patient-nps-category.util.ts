import { PatientNpsCategory } from '@prisma/client';

export function deriveNpsCategoryFromScore(score: number): PatientNpsCategory {
  if (score <= 6) {
    return PatientNpsCategory.DETRACTOR;
  }
  if (score <= 8) {
    return PatientNpsCategory.PASSIVE;
  }
  return PatientNpsCategory.PROMOTER;
}

export function calculateNpsScoreFromCounts(input: {
  promoterCount: number;
  passiveCount: number;
  detractorCount: number;
}): number | null {
  const total =
    input.promoterCount + input.passiveCount + input.detractorCount;
  if (total === 0) {
    return null;
  }
  const promoterPct = (input.promoterCount / total) * 100;
  const detractorPct = (input.detractorCount / total) * 100;
  return Math.round(promoterPct - detractorPct);
}
