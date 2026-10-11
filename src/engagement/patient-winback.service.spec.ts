import { PatientWinbackService } from './patient-winback.service';

describe('PatientWinbackService previewEligibleSegment', () => {
  it('returns at-risk lapsed count and audits preview', async () => {
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
      },
    };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new PatientWinbackService(
      prisma as never,
      auditService as never,
      {} as never,
    );

    const result = await service.previewEligibleSegment(
      { sub: 'u1', hospitalId: 'h1', branchId: 'b1' },
      'b1',
    );

    expect(result).toEqual({
      segment: 'at_risk_lapsed',
      branchId: 'b1',
      eligiblePatientCount: 2,
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ENGAGEMENT_WINBACK_SEGMENT_PREVIEW' }),
    );
  });
});
