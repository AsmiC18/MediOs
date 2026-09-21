import { Injectable } from '@nestjs/common';
import { AbdmRegistrationStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateAbdmConfigDto } from './dto/update-abdm-config.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class AbdmConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getConfig(user: AuthenticatedUser) {
    const config = await this.prisma.abdmHospitalConfig.findUnique({
      where: {
        hospitalId: user.hospitalId,
      },
    });

    if (!config) {
      return {
        hospitalId: user.hospitalId,
        hfrId: null,
        hfrTrackingId: null,
        hfrFacilityName: null,
        hfrFacilityStatus: null,
        hfrVerifiedAt: null,
        hfrRegistrationReference: null,
        hipId: null,
        hiuId: null,
        bridgeId: null,
        callbackBaseUrl: null,
        hfrStatus: AbdmRegistrationStatus.NOT_REGISTERED,
        hipStatus: AbdmRegistrationStatus.NOT_REGISTERED,
        registeredAt: null,
        lastSyncedAt: null,
        notes: null,
      };
    }

    return config;
  }

  async updateConfig(user: AuthenticatedUser, dto: UpdateAbdmConfigDto) {
    const now = new Date();
    const shouldSetRegisteredAt =
      dto.hfrStatus === AbdmRegistrationStatus.REGISTERED ||
      dto.hipStatus === AbdmRegistrationStatus.REGISTERED;

    const config = await this.prisma.abdmHospitalConfig.upsert({
      where: {
        hospitalId: user.hospitalId,
      },
      create: {
        hospitalId: user.hospitalId,
        hfrId: dto.hfrId,
        hipId: dto.hipId,
        hiuId: dto.hiuId,
        bridgeId: dto.bridgeId,
        callbackBaseUrl: dto.callbackBaseUrl,
        hfrStatus: dto.hfrStatus ?? AbdmRegistrationStatus.NOT_REGISTERED,
        hipStatus: dto.hipStatus ?? AbdmRegistrationStatus.NOT_REGISTERED,
        registeredAt: shouldSetRegisteredAt ? now : undefined,
        lastSyncedAt: now,
        notes: dto.notes,
      },
      update: {
        ...(dto.hfrId !== undefined && { hfrId: dto.hfrId }),
        ...(dto.hipId !== undefined && { hipId: dto.hipId }),
        ...(dto.hiuId !== undefined && { hiuId: dto.hiuId }),
        ...(dto.bridgeId !== undefined && { bridgeId: dto.bridgeId }),
        ...(dto.callbackBaseUrl !== undefined && {
          callbackBaseUrl: dto.callbackBaseUrl,
        }),
        ...(dto.hfrStatus !== undefined && { hfrStatus: dto.hfrStatus }),
        ...(dto.hipStatus !== undefined && { hipStatus: dto.hipStatus }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        lastSyncedAt: now,
        ...(shouldSetRegisteredAt && { registeredAt: now }),
      },
    });

    await this.auditService.log({
      action: 'ABDM_CONFIG_UPDATED',
      entity: 'AbdmHospitalConfig',
      entityId: config.id,
      hospitalId: user.hospitalId,
      branchId: user.branchId,
      userId: user.sub,
      metadata: {
        hfrStatus: config.hfrStatus,
        hipStatus: config.hipStatus,
      },
    });

    return config;
  }
}
