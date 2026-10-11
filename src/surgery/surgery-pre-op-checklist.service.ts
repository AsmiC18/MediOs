import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { assertBranchAccess } from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { DEFAULT_SURGERY_PRE_OP_CHECKLIST } from './surgery-pre-op-checklist.constants';

type StaffUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const SURGERY_PREOP_CHECKLIST_COMPLETE = 'SURGERY_PREOP_CHECKLIST_ITEM_COMPLETE';

@Injectable()
export class SurgeryPreOpChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getChecklist(user: StaffUser, surgeryRequestId: string) {
    const request = await this.findOwnedRequest(user, surgeryRequestId);
    await this.ensureDefaultItems(request.hospitalId, request.id);
    return this.prisma.surgeryPreOpChecklistItem.findMany({
      where: { hospitalId: user.hospitalId, surgeryRequestId: request.id },
      orderBy: { itemKey: 'asc' },
    });
  }

  async completeItem(
    user: StaffUser,
    surgeryRequestId: string,
    itemKey: string,
    notes?: string,
  ) {
    const request = await this.findOwnedRequest(user, surgeryRequestId);
    const item = await this.prisma.surgeryPreOpChecklistItem.findFirst({
      where: {
        surgeryRequestId: request.id,
        hospitalId: user.hospitalId,
        itemKey,
      },
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    const updated = await this.prisma.surgeryPreOpChecklistItem.update({
      where: { id: item.id },
      data: {
        completedAt: new Date(),
        completedByUserId: user.sub,
        notes: notes?.trim() || item.notes,
      },
    });

    await this.auditService.log({
      action: SURGERY_PREOP_CHECKLIST_COMPLETE,
      entity: 'SurgeryPreOpChecklistItem',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: request.branchId,
      userId: user.sub,
      metadata: { surgeryRequestId: request.id, itemKey },
    });

    return updated;
  }

  private async ensureDefaultItems(hospitalId: string, surgeryRequestId: string) {
    const count = await this.prisma.surgeryPreOpChecklistItem.count({
      where: { hospitalId, surgeryRequestId },
    });
    if (count > 0) {
      return;
    }
    await this.prisma.surgeryPreOpChecklistItem.createMany({
      data: DEFAULT_SURGERY_PRE_OP_CHECKLIST.map((row) => ({
        hospitalId,
        surgeryRequestId,
        itemKey: row.itemKey,
        label: row.label,
        isRequired: row.isRequired,
      })),
    });
  }

  private async findOwnedRequest(user: StaffUser, surgeryRequestId: string) {
    const request = await this.prisma.surgeryRequest.findFirst({
      where: { id: surgeryRequestId, hospitalId: user.hospitalId },
    });
    if (!request) {
      throw new NotFoundException('Surgery request not found');
    }
    if (request.branchId) {
      assertBranchAccess(user, request.branchId);
    }
    return request;
  }
}
