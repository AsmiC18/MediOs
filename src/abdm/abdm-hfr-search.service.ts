import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AbdmEnvironmentService } from './abdm-environment.service';
import { AbdmHeadersService } from './abdm-headers.service';
import { AbdmSessionService } from './abdm-session.service';
import { SearchHfrDto } from './dto/search-hfr.dto';
import { abdmFetch, parseAbdmJsonResponse } from './utils/abdm-http.util';
import { normalizeHfrId, validateHfrId } from './utils/hfr-format.util';

export type HfrFacilitySummary = {
  facilityId: string;
  facilityName: string;
  facilityStatus: string;
  ownership?: string;
  stateName?: string;
  districtName?: string;
  address?: string;
  pincode?: string;
};

export type HfrSearchResult = {
  facilities: HfrFacilitySummary[];
  totalFacilities: number;
  numberOfPages: number;
  message?: string;
  mock?: boolean;
};

const MOCK_FACILITIES: HfrFacilitySummary[] = [
  {
    facilityId: 'IN3410000261',
    facilityName: 'MediOS Demo Hospital',
    facilityStatus: 'Approved',
    ownership: 'Private',
    stateName: 'PUDUCHERRY',
    districtName: 'PONDICHERRY',
    address: '123 Demo Street',
    pincode: '605001',
  },
  {
    facilityId: 'IN3410000260',
    facilityName: 'MediOS Sample Clinic',
    facilityStatus: 'Submitted',
    ownership: 'Private',
    stateName: 'PUDUCHERRY',
    districtName: 'MAHE',
    address: '456 Sample Road',
    pincode: '605110',
  },
];

function parseHfrSearchResponse(body: unknown): HfrSearchResult {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('ABDM HFR search returned malformed response');
  }

  const record = body as Record<string, unknown>;
  const facilitiesRaw = Array.isArray(record.facilities) ? record.facilities : [];

  const facilities = facilitiesRaw.flatMap((item): HfrFacilitySummary[] => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const facility = item as Record<string, unknown>;
    const facilityId =
      typeof facility.facilityId === 'string' ? facility.facilityId : null;
    const facilityName =
      typeof facility.facilityName === 'string' ? facility.facilityName : null;
    const facilityStatus =
      typeof facility.facilityStatus === 'string'
        ? facility.facilityStatus
        : null;

    if (!facilityId || !facilityName || !facilityStatus) {
      return [];
    }

    return [
      {
        facilityId,
        facilityName,
        facilityStatus,
        ownership:
          typeof facility.ownership === 'string' ? facility.ownership : undefined,
        stateName:
          typeof facility.stateName === 'string' ? facility.stateName : undefined,
        districtName:
          typeof facility.districtName === 'string'
            ? facility.districtName
            : undefined,
        address:
          typeof facility.address === 'string' ? facility.address : undefined,
        pincode:
          typeof facility.pincode === 'string' ? facility.pincode : undefined,
      },
    ];
  });

  return {
    facilities,
    totalFacilities:
      typeof record.totalFacilities === 'number'
        ? record.totalFacilities
        : facilities.length,
    numberOfPages:
      typeof record.numberOfPages === 'number' ? record.numberOfPages : 1,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

@Injectable()
export class AbdmHfrSearchService {
  constructor(
    private readonly environmentService: AbdmEnvironmentService,
    private readonly sessionService: AbdmSessionService,
    private readonly headersService: AbdmHeadersService,
  ) {}

  async search(dto: SearchHfrDto): Promise<HfrSearchResult> {
    if (this.environmentService.isMockMode()) {
      return this.searchMock(dto);
    }

    const searchUrl = this.environmentService.getHfrSearchUrl();

    if (!searchUrl) {
      throw new ServiceUnavailableException(
        'ABDM HFR search is not available: ABDM_HFR_SEARCH_URL is not configured. ' +
          'The request/response schema is documented, but the exact sandbox/production URL path was not verified in this codebase.',
      );
    }

    const accessToken = await this.sessionService.getAccessToken();
    const payload = this.buildSearchPayload(dto);

    let response: Response;

    try {
      response = await abdmFetch(
        searchUrl,
        {
          method: 'POST',
          headers: {
            ...this.headersService.buildGatewayHeaders(accessToken),
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        },
        this.environmentService.getRequestTimeoutMs(),
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? error.message
          : 'Failed to call ABDM HFR search API',
      );
    }

    const body = await parseAbdmJsonResponse(response);

    if (response.status < 200 || response.status >= 300) {
      throw new BadRequestException('ABDM HFR search request failed');
    }

    return parseHfrSearchResponse(body);
  }

  async searchByFacilityId(facilityId: string): Promise<HfrSearchResult> {
    const normalized = validateHfrId(facilityId);
    return this.search({ facilityId: normalized, page: 1 });
  }

  private buildSearchPayload(dto: SearchHfrDto): Record<string, unknown> {
    const facilityId = dto.facilityId ? normalizeHfrId(dto.facilityId) : '';

    return {
      ownershipCode: dto.ownershipCode ?? '',
      stateLGDCode: dto.stateLGDCode ?? '',
      districtLGDCode: '',
      subDistrictLGDCode: '',
      pincode: '',
      facilityName: dto.facilityName ?? '',
      facilityId,
      page: dto.page ?? 1,
      resultsPerPage: 10,
    };
  }

  private searchMock(dto: SearchHfrDto): HfrSearchResult {
    if (dto.facilityId) {
      const normalized = normalizeHfrId(dto.facilityId);
      const match = MOCK_FACILITIES.filter(
        (facility) => facility.facilityId === normalized,
      );

      return {
        facilities: match,
        totalFacilities: match.length,
        numberOfPages: 1,
        message: 'Mock HFR search by facilityId',
        mock: true,
      };
    }

    const nameQuery = dto.facilityName?.trim().toLowerCase();
    const facilities = nameQuery
      ? MOCK_FACILITIES.filter((facility) =>
          facility.facilityName.toLowerCase().includes(nameQuery),
        )
      : MOCK_FACILITIES;

    return {
      facilities,
      totalFacilities: facilities.length,
      numberOfPages: 1,
      message: 'Mock HFR search',
      mock: true,
    };
  }
}
