import { BadRequestException } from '@nestjs/common';
import {
  InsuranceEmpanelment,
  InsuranceEmpanelmentStatus,
} from '@prisma/client';

export function isEmpanelmentEffectiveOnDate(
  empanelment: Pick<InsuranceEmpanelment, 'effectiveFrom' | 'effectiveTo'>,
  onDate: Date,
): boolean {
  const dayStart = new Date(onDate);
  dayStart.setHours(0, 0, 0, 0);

  const from = new Date(empanelment.effectiveFrom);
  from.setHours(0, 0, 0, 0);
  if (dayStart < from) {
    return false;
  }

  if (empanelment.effectiveTo) {
    const to = new Date(empanelment.effectiveTo);
    to.setHours(23, 59, 59, 999);
    if (dayStart > to) {
      return false;
    }
  }

  return true;
}

export function assertUsableEmpanelment(
  empanelment: InsuranceEmpanelment,
  options: {
    hospitalId: string;
    providerId: string;
    branchId?: string | null;
    onDate?: Date;
  },
): void {
  if (empanelment.hospitalId !== options.hospitalId) {
    throw new BadRequestException('Empanelment does not belong to this hospital');
  }

  if (empanelment.providerId !== options.providerId) {
    throw new BadRequestException('Empanelment does not match insurance provider');
  }

  if (empanelment.status !== InsuranceEmpanelmentStatus.ACTIVE) {
    throw new BadRequestException('Empanelment is not active');
  }

  const onDate = options.onDate ?? new Date();
  if (!isEmpanelmentEffectiveOnDate(empanelment, onDate)) {
    throw new BadRequestException('Empanelment is not effective on the requested date');
  }

  if (empanelment.branchId != null) {
    if (!options.branchId) {
      throw new BadRequestException('Branch-specific empanelment requires a branch context');
    }
    if (empanelment.branchId !== options.branchId) {
      throw new BadRequestException('Empanelment is not valid for this branch');
    }
  }
}

export function empanelmentScopeKey(branchId: string | null | undefined): string {
  return branchId ?? '__HOSPITAL_WIDE__';
}
