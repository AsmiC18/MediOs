import {
  ClinicalSafetyPolicyAction,
  InteractionAdapterStatus,
  InteractionWhenUnavailable,
  PrescriptionSafetyFindingType,
  PrescriptionSafetySeverity,
} from '@prisma/client';
import { UnavailableDrugInteractionAdapter } from '../adapters/unavailable-drug-interaction.adapter';
import { ClinicalDrugService } from '../drugs/clinical-drug.service';
import { buildFindingKey } from './finding-key.util';
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

  it('adds WARNING finding when adapter is UNAVAILABLE and policy is ALLOW_WITH_WARNING', async () => {
    const result = await service.evaluateForPrescription({
      hospitalId: 'h1',
      patientId: 'p1',
      patientAllergies: [],
      patientUpdatedAt: new Date(),
      dto: { items: [{ medicationName: 'Test' }] },
    });

    expect(result.interactionCheckAvailable).toBe(false);
    expect(result.interactionAdapterStatus).toBe(InteractionAdapterStatus.UNAVAILABLE);

    const warning = result.findings.find(
      (f) =>
        f.findingType === PrescriptionSafetyFindingType.INTERACTION &&
        f.severity === PrescriptionSafetySeverity.WARNING,
    );
    expect(warning).toBeDefined();
    expect(warning?.findingKey).toBe(
      buildFindingKey(
        PrescriptionSafetyFindingType.INTERACTION,
        'UNAVAILABLE_WARNING',
      ),
    );
    expect(warning?.summary).toMatch(/unavailable/i);
    expect(warning?.summary).toMatch(/manual/i);
    expect(warning?.detailJson).toEqual({
      adapterStatus: InteractionAdapterStatus.UNAVAILABLE,
    });
    expect(result.blockingFindingKeys).toHaveLength(0);
  });

  it('adds BLOCK finding when adapter is UNAVAILABLE and policy is BLOCK', async () => {
    (policyService.getPolicyForHospital as jest.Mock).mockResolvedValueOnce({
      allergyUnresolvedDrugDefault: ClinicalSafetyPolicyAction.WARN,
      allergyIngredientMatch: ClinicalSafetyPolicyAction.WARN,
      allergyTextFallback: ClinicalSafetyPolicyAction.WARN,
      interactionWhenUnavailable: InteractionWhenUnavailable.BLOCK,
    });

    const result = await service.evaluateForPrescription({
      hospitalId: 'h1',
      patientId: 'p1',
      patientAllergies: [],
      patientUpdatedAt: new Date(),
      dto: { items: [{ medicationName: 'Test' }] },
    });

    expect(result.interactionCheckAvailable).toBe(false);
    const block = result.findings.find(
      (f) => f.severity === PrescriptionSafetySeverity.BLOCK,
    );
    expect(block?.findingKey).toBe(
      buildFindingKey(
        PrescriptionSafetyFindingType.INTERACTION,
        'UNAVAILABLE_BLOCK',
      ),
    );
    expect(result.blockingFindingKeys).toContain(block?.findingKey);
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
