import { BadRequestException } from '@nestjs/common';
import { SafetyFindingDraft } from './safety.types';

export class PrescriptionSafetyBlockedException extends BadRequestException {
  constructor(findings: SafetyFindingDraft[]) {
    super({
      message: 'Prescription blocked by safety evaluation',
      code: 'PRESCRIPTION_SAFETY_BLOCKED',
      findings: findings.map((f) => ({
        findingKey: f.findingKey,
        findingType: f.findingType,
        severity: f.severity,
        summary: f.summary,
        source: f.source,
      })),
    });
  }
}
