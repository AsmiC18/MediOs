import { BedStatus } from '@prisma/client';
import { buildIpdOccupancySummary } from './ipd-occupancy.util';

describe('buildIpdOccupancySummary', () => {
  it('returns null occupancy rate when there are zero active beds', async () => {
    const prisma = {
      ipdBed: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'b1', status: BedStatus.INACTIVE },
        ]),
      },
      ipdBedAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ipdAdmission: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const result = await buildIpdOccupancySummary(prisma as never, {
      hospitalId: 'h1',
      asOf: '2026-10-06T12:00:00.000Z',
    });

    expect(result.totalBeds).toBe(0);
    expect(result.occupancyRate).toBeNull();
  });
});
