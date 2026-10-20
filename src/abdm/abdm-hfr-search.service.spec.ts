import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmHeadersService } from './abdm-headers.service';
import { AbdmHfrSearchService } from './abdm-hfr-search.service';
import { AbdmSessionService } from './abdm-session.service';
import { AbdmHttpError, abdmFetch } from './utils/abdm-http.util';

jest.mock('./utils/abdm-http.util', () => {
  const actual = jest.requireActual<typeof import('./utils/abdm-http.util')>(
    './utils/abdm-http.util',
  );
  return {
    ...actual,
    abdmFetch: jest.fn(),
  };
});

const abdmFetchMock = jest.mocked(abdmFetch);

const HFR_SEARCH_URL = 'https://example.test/hfr-search';
const ACCESS_TOKEN = 'test-access-token';
const REQUEST_TIMEOUT_MS = 45_000;

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('AbdmHfrSearchService', () => {
  let environmentService: jest.Mocked<
    Pick<
      AbdmEnvironmentService,
      'isMockMode' | 'getHfrSearchUrl' | 'getRequestTimeoutMs'
    >
  >;
  let sessionService: jest.Mocked<Pick<AbdmSessionService, 'getAccessToken'>>;
  let headersService: AbdmHeadersService;
  let service: AbdmHfrSearchService;

  beforeEach(() => {
    abdmFetchMock.mockReset();
    sessionService = {
      getAccessToken: jest.fn().mockResolvedValue(ACCESS_TOKEN),
    };
    environmentService = {
      isMockMode: jest.fn().mockReturnValue(false),
      getHfrSearchUrl: jest.fn().mockReturnValue(HFR_SEARCH_URL),
      getRequestTimeoutMs: jest.fn().mockReturnValue(REQUEST_TIMEOUT_MS),
    };

    const envForHeaders = {
      getXCmId: () => 'sbx',
    } as AbdmEnvironmentService;
    headersService = new AbdmHeadersService(envForHeaders);

    service = new AbdmHfrSearchService(
      environmentService as unknown as AbdmEnvironmentService,
      sessionService as unknown as AbdmSessionService,
      headersService,
    );
  });

  it('mock mode returns mock results without session or network calls', async () => {
    environmentService.isMockMode.mockReturnValue(true);

    const result = await service.search({ facilityId: 'IN3410000261' });

    expect(result.mock).toBe(true);
    expect(result.facilities).toHaveLength(1);
    expect(result.facilities[0].facilityId).toBe('IN3410000261');
    expect(sessionService.getAccessToken).not.toHaveBeenCalled();
    expect(abdmFetchMock).not.toHaveBeenCalled();
  });

  it('real mode throws 503 when ABDM_HFR_SEARCH_URL is not configured', async () => {
    environmentService.getHfrSearchUrl.mockReturnValue(null);

    await expect(service.search({ facilityName: 'Demo' })).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(service.search({ facilityName: 'Demo' })).rejects.toThrow(
      /ABDM_HFR_SEARCH_URL is not configured/,
    );
    expect(sessionService.getAccessToken).not.toHaveBeenCalled();
    expect(abdmFetchMock).not.toHaveBeenCalled();
  });

  it('real mode POSTs exact URL, payload, headers, and timeout', async () => {
    abdmFetchMock.mockResolvedValue(
      jsonResponse(200, {
        facilities: [
          {
            facilityId: 'IN3410000261',
            facilityName: 'Example Facility',
            facilityStatus: 'Approved',
          },
        ],
        totalFacilities: 1,
        numberOfPages: 1,
      }),
    );

    await service.search({
      facilityId: 'in3410000261',
      facilityName: 'Example',
      ownershipCode: 'P',
      stateLGDCode: '34',
      page: 2,
    });

    expect(sessionService.getAccessToken).toHaveBeenCalledTimes(1);
    expect(abdmFetchMock).toHaveBeenCalledTimes(1);

    const [url, init, timeoutMs] = abdmFetchMock.mock.calls[0];
    expect(url).toBe(HFR_SEARCH_URL);
    expect(init?.method).toBe('POST');
    expect(timeoutMs).toBe(REQUEST_TIMEOUT_MS);

    expect(JSON.parse(String(init?.body))).toEqual({
      ownershipCode: 'P',
      stateLGDCode: '34',
      districtLGDCode: '',
      subDistrictLGDCode: '',
      pincode: '',
      facilityName: 'Example',
      facilityId: 'IN3410000261',
      page: 2,
      resultsPerPage: 10,
    });

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.Accept).toBe('application/json');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-CM-ID']).toBe('sbx');
    expect(headers['REQUEST-ID']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(headers.TIMESTAMP).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('real mode maps successful response fields', async () => {
    abdmFetchMock.mockResolvedValue(
      jsonResponse(200, {
        facilities: [
          {
            facilityId: 'IN3410000261',
            facilityName: 'Mapped Facility',
            facilityStatus: 'Approved',
            ownership: 'Private',
            stateName: 'STATE',
            districtName: 'DIST',
            address: '1 Main St',
            pincode: '123456',
          },
          { facilityId: 'bad', facilityName: null, facilityStatus: 'X' },
        ],
        totalFacilities: 99,
        numberOfPages: 3,
        message: 'ok',
      }),
    );

    const result = await service.search({ facilityId: 'IN3410000261' });

    expect(result).toEqual({
      facilities: [
        {
          facilityId: 'IN3410000261',
          facilityName: 'Mapped Facility',
          facilityStatus: 'Approved',
          ownership: 'Private',
          stateName: 'STATE',
          districtName: 'DIST',
          address: '1 Main St',
          pincode: '123456',
        },
      ],
      totalFacilities: 99,
      numberOfPages: 3,
      message: 'ok',
    });
    expect(result.mock).toBeUndefined();
  });

  it('real mode wraps network errors as 503', async () => {
    abdmFetchMock.mockRejectedValue(new AbdmHttpError('ABDM request timed out'));

    await expect(service.search({ facilityName: 'Demo' })).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(service.search({ facilityName: 'Demo' })).rejects.toThrow(
      /ABDM request timed out/,
    );
  });

  it('real mode throws 400 on non-2xx HTTP status', async () => {
    abdmFetchMock.mockResolvedValue(
      jsonResponse(502, { message: 'upstream error' }),
    );

    await expect(service.search({ facilityName: 'Demo' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.search({ facilityName: 'Demo' })).rejects.toThrow(
      /ABDM HFR search request failed/,
    );
  });
});
