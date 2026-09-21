import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { AbdmRegistrationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AbdmHfrSearchService, HfrFacilitySummary } from './abdm-hfr-search.service';
import { LinkHfrDto } from './dto/link-hfr.dto';
import { SearchHfrDto } from './dto/search-hfr.dto';
import {
  mapHfrFacilityStatusToRegistrationStatus,
  validateHfrId,
} from './utils/hfr-format.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class AbdmHfrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly hfrSearchService: AbdmHfrSearchService,
  ) {}

  async getHfr(user: AuthenticatedUser) {
    const config = await this.prisma.abdmHospitalConfig.findUnique({
      where: { hospitalId: user.hospitalId },
    });

    return {
      hospitalId: user.hospitalId,
      hfrId: config?.hfrId ?? null,
      hipId: config?.hipId ?? null,
      hfrStatus: config?.hfrStatus ?? AbdmRegistrationStatus.NOT_REGISTERED,
      hfrFacilityName: config?.hfrFacilityName ?? null,
      hfrFacilityStatus: config?.hfrFacilityStatus ?? null,
      hfrVerifiedAt: config?.hfrVerifiedAt ?? null,
      lastSyncedAt: config?.lastSyncedAt ?? null,
    };
  }

  async linkHfr(user: AuthenticatedUser, dto: LinkHfrDto) {
    let hfrId: string;

    try {
      hfrId = validateHfrId(dto.hfrId);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid HFR ID',
      );
    }

    const verifyWithRegistry = dto.verifyWithRegistry === true;
    let facility: HfrFacilitySummary | null = null;

    if (verifyWithRegistry) {
      const searchResult = await this.hfrSearchService.searchByFacilityId(hfrId);
      facility =
        searchResult.facilities.find((item) => item.facilityId === hfrId) ??
        null;

      if (!facility) {
        throw new BadRequestException(
          'HFR ID was not found in the ABDM facility registry search results',
        );
      }
    }

    const now = new Date();
    const mappedStatus = facility
      ? mapHfrFacilityStatusToRegistrationStatus(facility.facilityStatus)
      : null;
    const hfrStatus = mappedStatus ?? AbdmRegistrationStatus.PENDING;
    const hfrVerifiedAt =
      hfrStatus === AbdmRegistrationStatus.REGISTERED ? now : null;

    const config = await this.prisma.abdmHospitalConfig.upsert({
      where: { hospitalId: user.hospitalId },
      create: {
        hospitalId: user.hospitalId,
        hfrId,
        hfrStatus,
        hfrFacilityName: facility?.facilityName,
        hfrFacilityStatus: facility?.facilityStatus,
        hfrVerifiedAt,
        lastSyncedAt: verifyWithRegistry ? now : undefined,
        registeredAt:
          hfrStatus === AbdmRegistrationStatus.REGISTERED ? now : undefined,
      },
      update: {
        hfrId,
        hfrStatus,
        hfrFacilityName: facility?.facilityName ?? undefined,
        hfrFacilityStatus: facility?.facilityStatus ?? undefined,
        hfrVerifiedAt,
        lastSyncedAt: verifyWithRegistry ? now : undefined,
        ...(hfrStatus === AbdmRegistrationStatus.REGISTERED && {
          registeredAt: now,
        }),
      },
    });

    await this.auditService.log({
      action: 'ABDM_HFR_LINKED',
      entity: 'AbdmHospitalConfig',
      entityId: config.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      userId: user.sub,
      metadata: {
        hfrId,
        verifyWithRegistry,
        registryConfirmed: Boolean(facility),
        hfrStatus: config.hfrStatus,
      },
    });

    return this.getHfr(user);
  }

  async searchHfr(user: AuthenticatedUser, dto: SearchHfrDto) {
    const result = await this.hfrSearchService.search(dto);

    await this.auditService.log({
      action: 'ABDM_HFR_SEARCHED',
      entity: 'AbdmHospitalConfig',
      entityId: user.hospitalId,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      userId: user.sub,
      metadata: {
        facilityId: dto.facilityId ?? null,
        resultCount: result.facilities.length,
        mock: result.mock ?? false,
      },
    });

    return result;
  }

  async syncHfr(user: AuthenticatedUser) {
    const existing = await this.prisma.abdmHospitalConfig.findUnique({
      where: { hospitalId: user.hospitalId },
    });

    if (!existing?.hfrId) {
      throw new BadRequestException('Hospital does not have a linked HFR ID to sync');
    }

    const searchResult = await this.hfrSearchService.searchByFacilityId(
      existing.hfrId,
    );
    const facility =
      searchResult.facilities.find(
        (item) => item.facilityId === existing.hfrId,
      ) ?? null;

    if (!facility) {
      throw new BadRequestException(
        'Linked HFR ID was not found in the ABDM facility registry search results',
      );
    }

    const now = new Date();
    const mappedStatus = mapHfrFacilityStatusToRegistrationStatus(
      facility.facilityStatus,
    );
    const hfrStatus = mappedStatus ?? AbdmRegistrationStatus.PENDING;
    const hfrVerifiedAt =
      hfrStatus === AbdmRegistrationStatus.REGISTERED
        ? existing.hfrVerifiedAt ?? now
        : null;

    const config = await this.prisma.abdmHospitalConfig.update({
      where: { hospitalId: user.hospitalId },
      data: {
        hfrFacilityName: facility.facilityName,
        hfrFacilityStatus: facility.facilityStatus,
        hfrStatus,
        hfrVerifiedAt,
        lastSyncedAt: now,
        ...(hfrStatus === AbdmRegistrationStatus.REGISTERED && {
          registeredAt: existing.registeredAt ?? now,
        }),
      },
    });

    await this.auditService.log({
      action: 'ABDM_HFR_SYNCED',
      entity: 'AbdmHospitalConfig',
      entityId: config.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      userId: user.sub,
      metadata: {
        hfrId: existing.hfrId,
        hfrStatus: config.hfrStatus,
        facilityStatus: facility.facilityStatus,
        registryConfirmed: true,
      },
    });

    return this.getHfr(user);
  }
}
