import {
  ClinicalSafetyPolicyAction,
  InteractionAdapterStatus,
  InteractionWhenUnavailable,
  PrescriptionSafetySeverity,
} from '@prisma/client';
import { UnavailableDrugInteractionAdapter } from '../adapters/unavailable-drug-interaction.adapter';
import { ClinicalDrugService } from '../drugs/clinical-drug.service';
import { ClinicalSafetyPolicyService } from './clinical-safety-policy.service';
import { PrescriptionSafetyBlockedException } from './prescription-safety-block.exception';
import { PrescriptionSafetyService } from './prescription-safety.service';

describe('PrescriptionSafetyService', () => {
  const prisma = {
    rolePermission: { findFirst: jest.fn() },
    prescription: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const policyService = {
    getPolicyForHospital: jest.fn().mockResolvedValue({
      allergyUnresolvedDrugDefault: ClinicalSafetyPolicyAction.WARN,
      allergyIngredientMatch: ClinicalSafetyPolicyAction.BLOCK,
      allergyTextFallback: ClinicalSafetyPolicyAction.WARN,
      interactionWhenUnavailable: InteractionWhenUnavailable.ALLOW_WITH_WARNING,
    }),
  } as unknown as ClinicalSafetyPolicyService;

  const clinicalDrugService = {
    resolvePrescriptionLines: jest.fn(),
  } as unknown as ClinicalDrugService;

  const service = new PrescriptionSafetyService(
    prisma as never,
    clinicalDrugService,
    policyService,
    new UnavailableDrugInteractionAdapter(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (clinicalDrugService.resolvePrescriptionLines as jest.Mock).mockResolvedValue([
      {
        medicationName: 'Amoxicillin',
        clinicalDrugId: null,
        drugResolutionStatus: 'FREE_TEXT',
        ingredientNames: [],
      },
    ]);
  });

  it('returns UNAVAILABLE adapter status and interactionCheckAvailable false', async () => {
    const result = await service.evaluateForPrescription({
      hospitalId: 'h1',
      patientId: 'p1',
      patientAllergies: [],
      patientUpdatedAt: new Date(),
      dto: { items: [{ medicationName: 'Test' }] },
    });

    expect(result.interactionAdapterStatus).toBe(InteractionAdapterStatus.UNAVAILABLE);
    expect(result.interactionCheckAvailable).toBe(false);
  });

  it('throws when BLOCK findings exist without override', () => {
    expect(() =>
      service.assertCanPersist(
        {
          resolvedLines: [],
          findings: [
            {
              findingKey: 'k1',
              findingType: 'ALLERGY',
              severity: PrescriptionSafetySeverity.BLOCK,
              summary: 'blocked',
              source: 'RULES',
            },
          ],
          interactionAdapterStatus: InteractionAdapterStatus.UNAVAILABLE,
          interactionCheckAvailable: false,
          patientUpdatedAt: new Date(),
          blockingFindingKeys: ['k1'],
        },
        undefined,
        false,
      ),
    ).toThrow(PrescriptionSafetyBlockedException);
  });

  it('allows override with permission and matching keys', () => {
    const findings = service.assertCanPersist(
      {
        resolvedLines: [],
        findings: [
          {
            findingKey: 'k1',
            findingType: 'ALLERGY',
            severity: PrescriptionSafetySeverity.BLOCK,
            summary: 'blocked',
            source: 'RULES',
          },
        ],
        interactionAdapterStatus: InteractionAdapterStatus.UNAVAILABLE,
        interactionCheckAvailable: false,
        patientUpdatedAt: new Date(),
        blockingFindingKeys: ['k1'],
      },
      { findingKeys: ['k1'], reason: 'Clinical review completed' },
      true,
    );

    expect(findings[0].overridden).toBe(true);
  });
});
