import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateBookingRuleDto } from './dto/create-booking-rule.dto';
import { UpdateBookingRuleDto } from './dto/update-booking-rule.dto';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

@Injectable()
export class BookingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private validateDurationBounds(
    minDurationMinutes: number,
    maxDurationMinutes: number,
  ): void {
    if (minDurationMinutes > maxDurationMinutes) {
      throw new BadRequestException(
        'minDurationMinutes must be less than or equal to maxDurationMinutes',
      );
    }
  }

  private async findOwnedRule(user: AuthenticatedUser, ruleId: string) {
    const rule = await this.prisma.bookingRule.findUnique({
      where: {
        id: ruleId,
      },
    });

    if (!rule || rule.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Booking rule not found');
    }

    return rule;
  }

  private async findOwnedBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: {
        id: branchId,
      },
    });

    if (!branch || branch.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  private toResponse(rule: {
    id: string;
    hospitalId: string;
    minDurationMinutes: number;
    maxDurationMinutes: number;
    slotDurationMinutes: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: rule.id,
      hospitalId: rule.hospitalId,
      minDurationMinutes: rule.minDurationMinutes,
      maxDurationMinutes: rule.maxDurationMinutes,
      slotDurationMinutes: rule.slotDurationMinutes,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateBookingRuleDto) {
    this.validateDurationBounds(
      dto.minDurationMinutes,
      dto.maxDurationMinutes,
    );

    const rule = await this.prisma.bookingRule.create({
      data: {
        hospitalId: user.hospitalId,
        minDurationMinutes: dto.minDurationMinutes,
        maxDurationMinutes: dto.maxDurationMinutes,
        slotDurationMinutes: dto.slotDurationMinutes,
      },
    });

    await this.auditService.log({
      action: 'BOOKING_RULE_CREATED',
      entity: 'BookingRule',
      entityId: rule.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return this.toResponse(rule);
  }

  async findAll(user: AuthenticatedUser) {
    const rules = await this.prisma.bookingRule.findMany({
      where: {
        hospitalId: user.hospitalId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rules.map((rule) => this.toResponse(rule));
  }

  async findOne(user: AuthenticatedUser, ruleId: string) {
    const rule = await this.findOwnedRule(user, ruleId);
    return this.toResponse(rule);
  }

  async update(
    user: AuthenticatedUser,
    ruleId: string,
    dto: UpdateBookingRuleDto,
  ) {
    const existing = await this.findOwnedRule(user, ruleId);

    const minDurationMinutes =
      dto.minDurationMinutes ?? existing.minDurationMinutes;
    const maxDurationMinutes =
      dto.maxDurationMinutes ?? existing.maxDurationMinutes;

    this.validateDurationBounds(minDurationMinutes, maxDurationMinutes);

    const rule = await this.prisma.bookingRule.update({
      where: {
        id: ruleId,
      },
      data: {
        ...(dto.minDurationMinutes !== undefined && {
          minDurationMinutes: dto.minDurationMinutes,
        }),
        ...(dto.maxDurationMinutes !== undefined && {
          maxDurationMinutes: dto.maxDurationMinutes,
        }),
        ...(dto.slotDurationMinutes !== undefined && {
          slotDurationMinutes: dto.slotDurationMinutes,
        }),
      },
    });

    await this.auditService.log({
      action: 'BOOKING_RULE_UPDATED',
      entity: 'BookingRule',
      entityId: rule.id,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return this.toResponse(rule);
  }

  async remove(user: AuthenticatedUser, ruleId: string) {
    await this.findOwnedRule(user, ruleId);

    await this.prisma.$transaction(async (tx) => {
      await tx.hospital.updateMany({
        where: {
          defaultBookingRuleId: ruleId,
        },
        data: {
          defaultBookingRuleId: null,
        },
      });

      await tx.branch.updateMany({
        where: {
          bookingRuleId: ruleId,
        },
        data: {
          bookingRuleId: null,
        },
      });

      await tx.bookingRule.delete({
        where: {
          id: ruleId,
        },
      });
    });

    await this.auditService.log({
      action: 'BOOKING_RULE_DELETED',
      entity: 'BookingRule',
      entityId: ruleId,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return {
      id: ruleId,
      deleted: true,
    };
  }

  async setHospitalDefault(user: AuthenticatedUser, ruleId: string) {
    await this.findOwnedRule(user, ruleId);

    await this.prisma.hospital.update({
      where: {
        id: user.hospitalId,
      },
      data: {
        defaultBookingRuleId: ruleId,
      },
    });

    await this.auditService.log({
      action: 'BOOKING_RULE_ASSIGNED_HOSPITAL_DEFAULT',
      entity: 'BookingRule',
      entityId: ruleId,
      hospitalId: user.hospitalId,
      userId: user.sub,
    });

    return this.findOne(user, ruleId);
  }

  async assignBranch(
    user: AuthenticatedUser,
    ruleId: string,
    branchId: string,
  ) {
    await this.findOwnedRule(user, ruleId);
    await this.findOwnedBranch(user, branchId);

    await this.prisma.branch.update({
      where: {
        id: branchId,
      },
      data: {
        bookingRuleId: ruleId,
      },
    });

    await this.auditService.log({
      action: 'BOOKING_RULE_ASSIGNED_BRANCH',
      entity: 'BookingRule',
      entityId: ruleId,
      hospitalId: user.hospitalId,
      branchId,
      userId: user.sub,
    });

    return this.findOne(user, ruleId);
  }

  async removeBranchOverride(user: AuthenticatedUser, branchId: string) {
    await this.findOwnedBranch(user, branchId);

    await this.prisma.branch.update({
      where: {
        id: branchId,
      },
      data: {
        bookingRuleId: null,
      },
    });

    await this.auditService.log({
      action: 'BOOKING_RULE_BRANCH_OVERRIDE_REMOVED',
      entity: 'BookingRule',
      hospitalId: user.hospitalId,
      branchId,
      userId: user.sub,
    });

    return {
      branchId,
      bookingRuleId: null,
    };
  }
}
