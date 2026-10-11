import {
  ForbiddenException,
  Injectable,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import {
  InteractionAdapterStatus,
  InteractionWhenUnavailable,
  PrescriptionSafetyFindingType,
  PrescriptionSafetySeverity,
  PrescriptionSafetyFindingSource,
  PrescriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildFindingKey } from './finding-key.util';
import { DRUG_INTERACTION_ADAPTER } from '../adapters/drug-interaction.adapter';
import type { DrugInteractionAdapter } from '../adapters/drug-interaction.adapter';
import { ClinicalDrugService } from '../drugs/clinical-drug.service';
import { CreatePrescriptionDto } from '../dto/create-prescription.dto';
import { AllergyEvaluator } from './allergy-evaluator';
import { ClinicalSafetyPolicyService } from './clinical-safety-policy.service';
import {
  CLINICAL_SAFETY_OVERRIDE_PERMISSION,
  PRESCRIPTION_SAFETY_EVALUATOR_VERSION,
} from './safety.constants';
import { PrescriptionSafetyBlockedException } from './prescription-safety-block.exception';
import {
  PrescriptionSafetyEvaluationResult,
  ResolvedPrescriptionLine,
  SafetyFindingDraft,
  SafetyOverrideInput,
} from './safety.types';

type EvaluateInput = {
  hospitalId: string;
  patientId: string;
  patientAllergies: string[];
  patientUpdatedAt: Date;
  dto: CreatePrescriptionDto;
};

@Injectable()
export class PrescriptionSafetyService {
  private readonly allergyEvaluator = new AllergyEvaluator();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicalDrugService: ClinicalDrugService,
    private readonly policyService: ClinicalSafetyPolicyService,
    @Inject(DRUG_INTERACTION_ADAPTER)
    private readonly interactionAdapter: DrugInteractionAdapter,
  ) {}

  async evaluateForPrescription(
    input: EvaluateInput,
  ): Promise<PrescriptionSafetyEvaluationResult> {
    const policy = await this.policyService.getPolicyForHospital(
      input.hospitalId,
    );

    const lines = await this.clinicalDrugService.resolvePrescriptionLines(
      input.hospitalId,
      input.dto.items,
    );

    const allergyFindings = this.allergyEvaluator.evaluate(
      input.patientAllergies,
      lines,
      policy,
    );

    const duplicateFindings = this.detectStructuralDuplicates(lines);

    const activeLines = await this.loadActivePrescriptionLines(
      input.hospitalId,
      input.patientId,
    );

    const interactionResult = await this.interactionAdapter.checkInteractions({
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      candidateLines: lines.map((line) => ({
        medicationName: line.medicationName,
        clinicalDrugId: line.clinicalDrugId,
        ingredientNames: line.ingredientNames,
      })),
      activePrescriptionLines: activeLines,
    });

    const findings: SafetyFindingDraft[] = [
      ...allergyFindings,
      ...duplicateFindings,
      ...interactionResult.findings,
    ];

    if (
      interactionResult.status === InteractionAdapterStatus.UNAVAILABLE &&
      policy.interactionWhenUnavailable === InteractionWhenUnavailable.BLOCK
    ) {
      findings.push({
        findingKey: buildFindingKey(
          PrescriptionSafetyFindingType.INTERACTION,
          'UNAVAILABLE_BLOCK',
        ),
        findingType: PrescriptionSafetyFindingType.INTERACTION,
        severity: PrescriptionSafetySeverity.BLOCK,
        summary:
          'Drug interaction checking is unavailable and hospital policy blocks prescribing',
        detailJson: { adapterStatus: interactionResult.status },
        source: PrescriptionSafetyFindingSource.ADAPTER,
      });
    }

    if (interactionResult.status === InteractionAdapterStatus.ERROR) {
      findings.push({
        findingKey: buildFindingKey(
          PrescriptionSafetyFindingType.INTERACTION,
          'ADAPTER_ERROR',
        ),
        findingType: PrescriptionSafetyFindingType.INTERACTION,
        severity: PrescriptionSafetySeverity.WARNING,
        summary: 'Drug interaction service returned an error; verify manually',
        detailJson: { adapterStatus: interactionResult.status },
        source: PrescriptionSafetyFindingSource.ADAPTER,
      });
    }

    const dedupedFindings = dedupeFindingsByKey(findings);

    const blockingFindingKeys = dedupedFindings
      .filter((f) => f.severity === PrescriptionSafetySeverity.BLOCK)
      .map((f) => f.findingKey);

    const interactionCheckAvailable =
      interactionResult.status === InteractionAdapterStatus.OK;

    return {
      resolvedLines: lines,
      findings: dedupedFindings,
      interactionAdapterStatus: interactionResult.status,
      interactionCheckAvailable,
      patientUpdatedAt: input.patientUpdatedAt,
      blockingFindingKeys,
    };
  }

  assertCanPersist(
    evaluation: PrescriptionSafetyEvaluationResult,
    override: SafetyOverrideInput | undefined,
    hasOverridePermission: boolean,
  ): SafetyFindingDraft[] {
    if (evaluation.blockingFindingKeys.length === 0) {
      return evaluation.findings;
    }

    if (!override?.findingKeys?.length) {
      throw new PrescriptionSafetyBlockedException(
        evaluation.findings.filter((f) =>
          evaluation.blockingFindingKeys.includes(f.findingKey),
        ),
      );
    }

    const reason = override.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Safety override reason is required');
    }
    if (reason.length > 2000) {
      throw new BadRequestException('Safety override reason is too long');
    }

    if (!hasOverridePermission) {
      throw new ForbiddenException(
        `Missing permission: ${CLINICAL_SAFETY_OVERRIDE_PERMISSION}`,
      );
    }

    const blockSet = new Set(evaluation.blockingFindingKeys);
    const overrideSet = new Set(override.findingKeys);

    for (const key of blockSet) {
      if (!overrideSet.has(key)) {
        throw new PrescriptionSafetyBlockedException(
          evaluation.findings.filter((f) => blockSet.has(f.findingKey)),
        );
      }
    }

    for (const key of overrideSet) {
      if (!blockSet.has(key)) {
        throw new BadRequestException(
          'Override findingKeys must reference blocking findings from this evaluation',
        );
      }
    }

    const now = new Date();
    return evaluation.findings.map((finding) => {
      if (blockSet.has(finding.findingKey)) {
        return {
          ...finding,
          overridden: true,
          overrideReason: reason,
          overrideAt: now,
        };
      }
      return finding;
    });
  }

  async userHasSafetyOverridePermission(roleId: string): Promise<boolean> {
    const link = await this.prisma.rolePermission.findFirst({
      where: {
        roleId,
        permission: { name: CLINICAL_SAFETY_OVERRIDE_PERMISSION },
      },
    });
    return link != null;
  }

  getEvaluatorVersion(): string {
    return PRESCRIPTION_SAFETY_EVALUATOR_VERSION;
  }

  private detectStructuralDuplicates(
    lines: ResolvedPrescriptionLine[],
  ): SafetyFindingDraft[] {
    const seen = new Map<string, number>();
    const findings: SafetyFindingDraft[] = [];

    for (const line of lines) {
      if (!line.clinicalDrugId) {
        continue;
      }
      const count = (seen.get(line.clinicalDrugId) ?? 0) + 1;
      seen.set(line.clinicalDrugId, count);
    }

    for (const [clinicalDrugId, count] of seen.entries()) {
      if (count > 1) {
        findings.push({
          findingKey: buildFindingKey(
            PrescriptionSafetyFindingType.DUPLICATE_THERAPY,
            clinicalDrugId,
          ),
          findingType: PrescriptionSafetyFindingType.DUPLICATE_THERAPY,
          severity: PrescriptionSafetySeverity.INFO,
          summary:
            'The same clinical drug appears more than once on this prescription (structural duplicate)',
          detailJson: { clinicalDrugId, lineCount: count },
          source: PrescriptionSafetyFindingSource.RULES,
        });
      }
    }

    return findings;
  }

  private async loadActivePrescriptionLines(
    hospitalId: string,
    patientId: string,
  ) {
    const active = await this.prisma.prescription.findMany({
      where: {
        hospitalId,
        patientId,
        status: PrescriptionStatus.ACTIVE,
      },
      include: {
        items: {
          include: {
            clinicalDrug: {
              include: { ingredients: true },
            },
          },
        },
      },
    });

    return active.flatMap((rx) =>
      rx.items.map((item) => ({
        medicationName: item.medicationName,
        clinicalDrugId: item.clinicalDrugId,
        ingredientNames:
          item.clinicalDrug?.ingredients.map((i) => i.ingredientName) ?? [],
      })),
    );
  }
}

function dedupeFindingsByKey(findings: SafetyFindingDraft[]): SafetyFindingDraft[] {
  const byKey = new Map<string, SafetyFindingDraft>();
  for (const finding of findings) {
    const existing = byKey.get(finding.findingKey);
    if (!existing) {
      byKey.set(finding.findingKey, finding);
      continue;
    }
    if (
      severityRank(finding.severity) > severityRank(existing.severity)
    ) {
      byKey.set(finding.findingKey, finding);
    }
  }
  return [...byKey.values()];
}

function severityRank(severity: PrescriptionSafetySeverity): number {
  switch (severity) {
    case PrescriptionSafetySeverity.BLOCK:
      return 3;
    case PrescriptionSafetySeverity.WARNING:
      return 2;
    default:
      return 1;
  }
}
