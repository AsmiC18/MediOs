import { ForbiddenException } from '@nestjs/common';
import {
  applyBranchScope,
  assertBranchAccess,
} from './branch-scope.util';

describe('assertBranchAccess', () => {
  const branchA = '11111111-1111-4111-8111-111111111111';
  const branchB = '22222222-2222-4222-8222-222222222222';

  it('allows hospital-wide user when entity is on the same branch', () => {
    expect(() =>
      assertBranchAccess({ branchId: null }, branchA),
    ).not.toThrow();
  });

  it('allows hospital-wide user when entity is on a different branch', () => {
    expect(() =>
      assertBranchAccess({ branchId: undefined }, branchB),
    ).not.toThrow();
  });

  it('allows branch-scoped user when entity branch matches JWT branch', () => {
    expect(() =>
      assertBranchAccess({ branchId: branchA }, branchA),
    ).not.toThrow();
  });

  it('denies branch-scoped user when entity branch differs', () => {
    expect(() =>
      assertBranchAccess({ branchId: branchA }, branchB),
    ).toThrow(
      new ForbiddenException('Access to this branch is not permitted'),
    );
  });

  it('denies branch-scoped user when entity branch is null', () => {
    expect(() => assertBranchAccess({ branchId: branchA }, null)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertBranchAccess({ branchId: branchA }, undefined),
    ).toThrow(ForbiddenException);
  });
});

describe('applyBranchScope', () => {
  const branchA = '11111111-1111-4111-8111-111111111111';
  const branchB = '22222222-2222-4222-8222-222222222222';

  it('preserves the original where for hospital-wide users', () => {
    const where = {
      hospitalId: 'hospital-1',
      status: 'ACTIVE',
      branchId: branchB,
    };

    expect(applyBranchScope({ branchId: null }, where)).toEqual(where);
  });

  it('injects JWT branchId for branch-scoped users', () => {
    const where = {
      hospitalId: 'hospital-1',
      status: 'WAITING',
    };

    expect(applyBranchScope({ branchId: branchA }, where)).toEqual({
      hospitalId: 'hospital-1',
      status: 'WAITING',
      branchId: branchA,
    });
  });

  it('overrides client-supplied branchId with JWT branchId', () => {
    const where = {
      hospitalId: 'hospital-1',
      branchId: branchB,
    };

    expect(applyBranchScope({ branchId: branchA }, where)).toEqual({
      hospitalId: 'hospital-1',
      branchId: branchA,
    });
  });

  it('preserves unrelated where conditions when scoping', () => {
    const where = {
      hospitalId: 'hospital-1',
      patientId: 'patient-1',
      queueDate: { gte: new Date('2026-01-01') },
      branchId: branchB,
    };

    const scoped = applyBranchScope({ branchId: branchA }, where);

    expect(scoped.hospitalId).toBe('hospital-1');
    expect(scoped.patientId).toBe('patient-1');
    expect(scoped.queueDate).toEqual(where.queueDate);
    expect(scoped.branchId).toBe(branchA);
  });
});
