import { PatientNpsCategory } from '@prisma/client';
import {
  calculateNpsScoreFromCounts,
  deriveNpsCategoryFromScore,
} from './patient-nps-category.util';

describe('patient NPS category util', () => {
  it.each([
    [0, PatientNpsCategory.DETRACTOR],
    [6, PatientNpsCategory.DETRACTOR],
    [7, PatientNpsCategory.PASSIVE],
    [8, PatientNpsCategory.PASSIVE],
    [9, PatientNpsCategory.PROMOTER],
    [10, PatientNpsCategory.PROMOTER],
  ])('score %i maps to %s', (score, category) => {
    expect(deriveNpsCategoryFromScore(score)).toBe(category);
  });

  it('calculates NPS from counts', () => {
    expect(
      calculateNpsScoreFromCounts({
        promoterCount: 7,
        passiveCount: 2,
        detractorCount: 1,
      }),
    ).toBe(60);
  });

  it('returns null NPS when no responses', () => {
    expect(
      calculateNpsScoreFromCounts({
        promoterCount: 0,
        passiveCount: 0,
        detractorCount: 0,
      }),
    ).toBeNull();
  });
});
