import { AbhaLinkStatus } from '@prisma/client';
import { resolveCallbackHospitalId } from './callback-hospital-correlation.util';

describe('resolveCallbackHospitalId', () => {
  const hospitalA = '11111111-1111-4111-8111-111111111111';
  const hospitalB = '22222222-2222-4222-8222-222222222222';

  it('resolves hospital from trusted HIP ID header', () => {
    expect(
      resolveCallbackHospitalId({
        hipIdHeader: 'hip-a',
        requestId: 'req-1',
        configsForHipId: [{ hospitalId: hospitalA }],
        linksForRequestId: [],
      }),
    ).toBe(hospitalA);
  });

  it('fails closed when HIP ID maps to zero or multiple hospitals', () => {
    expect(
      resolveCallbackHospitalId({
        hipIdHeader: 'hip-unknown',
        requestId: 'req-1',
        configsForHipId: [],
        linksForRequestId: [
          {
            hospitalId: hospitalA,
            linkStatus: AbhaLinkStatus.LINK_PENDING,
          },
        ],
      }),
    ).toBeNull();

    expect(
      resolveCallbackHospitalId({
        hipIdHeader: 'hip-shared',
        requestId: 'req-1',
        configsForHipId: [
          { hospitalId: hospitalA },
          { hospitalId: hospitalB },
        ],
        linksForRequestId: [],
      }),
    ).toBeNull();
  });

  it('resolves from requestId only when exactly one hospital has pending/linked rows', () => {
    expect(
      resolveCallbackHospitalId({
        requestId: 'req-1',
        configsForHipId: [],
        linksForRequestId: [
          {
            hospitalId: hospitalA,
            linkStatus: AbhaLinkStatus.LINK_PENDING,
          },
        ],
      }),
    ).toBe(hospitalA);
  });

  it('fails closed when the same requestId exists in two hospitals', () => {
    expect(
      resolveCallbackHospitalId({
        requestId: 'shared-req',
        configsForHipId: [],
        linksForRequestId: [
          {
            hospitalId: hospitalA,
            linkStatus: AbhaLinkStatus.LINK_PENDING,
          },
          {
            hospitalId: hospitalB,
            linkStatus: AbhaLinkStatus.LINK_PENDING,
          },
        ],
      }),
    ).toBeNull();
  });
});
