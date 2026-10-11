import { BadRequestException } from '@nestjs/common';
import {
  InsuranceEmpanelmentStatus,
  InsuranceProviderType,
} from '@prisma/client';
import {
  assertUsableEmpanelment,
  isEmpanelmentEffectiveOnDate,
} from './empanelment.util';

const baseEmpanelment = {
  id: 'emp-1',
  hospitalId: 'h1',
  providerId: 'p1',
  branchId: null as string | null,
  referenceNumber: null,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: new Date('2026-12-31'),
  status: InsuranceEmpanelmentStatus.ACTIVE,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('empanelment.util', () => {
  it('accepts effective empanelment', () => {
    expect(
      isEmpanelmentEffectiveOnDate(baseEmpanelment, new Date('2026-06-01')),
    ).toBe(true);
    expect(() =>
      assertUsableEmpanelment(baseEmpanelment, {
        hospitalId: 'h1',
        providerId: 'p1',
        branchId: null,
        onDate: new Date('2026-06-01'),
      }),
    ).not.toThrow();
  });

  it('rejects future empanelment', () => {
    expect(() =>
      assertUsableEmpanelment(baseEmpanelment, {
        hospitalId: 'h1',
        providerId: 'p1',
        onDate: new Date('2025-12-01'),
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects expired empanelment', () => {
    expect(() =>
      assertUsableEmpanelment(baseEmpanelment, {
        hospitalId: 'h1',
        providerId: 'p1',
        onDate: new Date('2027-01-02'),
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects inactive empanelment', () => {
    expect(() =>
      assertUsableEmpanelment(
        { ...baseEmpanelment, status: InsuranceEmpanelmentStatus.INACTIVE },
        {
          hospitalId: 'h1',
          providerId: 'p1',
        },
      ),
    ).toThrow(BadRequestException);
  });

  it('enforces branch-specific empanelment', () => {
    const branchEmp = { ...baseEmpanelment, branchId: 'b1' };
    expect(() =>
      assertUsableEmpanelment(branchEmp, {
        hospitalId: 'h1',
        providerId: 'p1',
        branchId: 'b2',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      assertUsableEmpanelment(branchEmp, {
        hospitalId: 'h1',
        providerId: 'p1',
        branchId: 'b1',
      }),
    ).not.toThrow();
  });

  it('rejects wrong provider type context', () => {
    void InsuranceProviderType;
    expect(() =>
      assertUsableEmpanelment(baseEmpanelment, {
        hospitalId: 'h1',
        providerId: 'other',
      }),
    ).toThrow(BadRequestException);
  });
});
