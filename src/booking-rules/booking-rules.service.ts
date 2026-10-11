import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { BOOKING_POLICY_MAX_MINUTES } from '../scheduling/scheduling-booking-policy.util';
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

  private validatePolicyMinutes(
    field: string,
    value: number | null | undefined,
  ): void {
    if (value == null) {
      return;
    }
    if (value < 0 || value > BOOKING_POLICY_MAX_MINUTES) {
      throw new BadRequestException(
        `${field} must be between 0 and ${BOOKING_POLICY_MAX_MINUTES}`,
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

    assertBranchAccess(user, branch.id);

    return branch;
  }

  private toResponse(rule: {
    id: string;
    hospitalId: string;
    minDurationMinutes: number;
    maxDurationMinutes: number;
    slotDurationMinutes: number;
    minimumAdvanceMinutes: number;
    maximumAdvanceMinutes: number | null;
    cancellationWindowMinutes: number;
    bufferMinutes: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: rule.id,
      hospitalId: rule.hospitalId,
      minDurationMinutes: rule.minDurationMinutes,
      maxDurationMinutes: rule.maxDurationMinutes,
      slotDurationMinutes: rule.slotDurationMinutes,
      minimumAdvanceMinutes: rule.minimumAdvanceMinutes,
      maximumAdvanceMinutes: rule.maximumAdvanceMinutes,
      cancellationWindowMinutes: rule.cancellationWindowMinutes,
      bufferMinutes: rule.bufferMinutes,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateBookingRuleDto) {
    this.validateDurationBounds(
      dto.minDurationMinutes,
      dto.maxDurationMinutes,
    );
    this.validatePolicyMinutes(
      'minimumAdvanceMinutes',
      dto.minimumAdvanceMinutes ?? 0,
    );
    this.validatePolicyMinutes(
      'maximumAdvanceMinutes',
      dto.maximumAdvanceMinutes,
    );
    this.validatePolicyMinutes(
      'cancellationWindowMinutes',
      dto.cancellationWindowMinutes ?? 0,
    );
    this.validatePolicyMinutes('bufferMinutes', dto.bufferMinutes ?? 0);

    const rule = await this.prisma.bookingRule.create({
      data: {
        hospitalId: user.hospitalId,
        minDurationMinutes: dto.minDurationMinutes,
        maxDurationMinutes: dto.maxDurationMinutes,
        slotDurationMinutes: dto.slotDurationMinutes,
        minimumAdvanceMinutes: dto.minimumAdvanceMinutes ?? 0,
        maximumAdvanceMinutes: dto.maximumAdvanceMinutes ?? null,
        cancellationWindowMinutes: dto.cancellationWindowMinutes ?? 0,
        bufferMinutes: dto.bufferMinutes ?? 0,
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

    const nextMinimumAdvance =
      dto.minimumAdvanceMinutes ?? existing.minimumAdvanceMinutes;
    const nextMaximumAdvance =
      dto.maximumAdvanceMinutes !== undefined
        ? dto.maximumAdvanceMinutes
        : existing.maximumAdvanceMinutes;
    const nextCancellationWindow =
      dto.cancellationWindowMinutes ?? existing.cancellationWindowMinutes;
    const nextBuffer = dto.bufferMinutes ?? existing.bufferMinutes;

    this.validatePolicyMinutes('minimumAdvanceMinutes', nextMinimumAdvance);
    this.validatePolicyMinutes('maximumAdvanceMinutes', nextMaximumAdvance);
    this.validatePolicyMinutes(
      'cancellationWindowMinutes',
      nextCancellationWindow,
    );
    this.validatePolicyMinutes('bufferMinutes', nextBuffer);

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
        ...(dto.minimumAdvanceMinutes !== undefined && {
          minimumAdvanceMinutes: dto.minimumAdvanceMinutes,
        }),
        ...(dto.maximumAdvanceMinutes !== undefined && {
          maximumAdvanceMinutes: dto.maximumAdvanceMinutes,
        }),
        ...(dto.cancellationWindowMinutes !== undefined && {
          cancellationWindowMinutes: dto.cancellationWindowMinutes,
        }),
        ...(dto.bufferMinutes !== undefined && {
          bufferMinutes: dto.bufferMinutes,
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
