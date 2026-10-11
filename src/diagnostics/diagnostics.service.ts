import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClinicalEncounterStatus,
  DiagnosticOrderItemStatus,
  DiagnosticOrderPriority,
  DiagnosticOrderStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { buildDiagnosticOrderBillingEvent } from '../billing/department/department-billing-event.util';
import { roundMoney, toDecimal } from '../billing/utils/money.util';
import { DepartmentBillingEnqueueService } from '../billing/department/department-billing-enqueue.service';
import { departmentBillingJobKey } from '../billing/department/department-billing-enqueue.service';
import { JOB_TYPES } from '../jobs/job-types.constants';
import {
  applyBranchScope,
  assertBranchAccess,
} from '../common/auth/branch-scope.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { DomainEventOutboxService } from '../notifications/domain-event-outbox.service';
import { buildDiagnosticOrderCompletedDomainEvent } from './diagnostic-order-completed-event.util';
import { CreateDiagnosticOrderDto } from './dto/create-diagnostic-order.dto';
import { DiagnosticOrderQueryDto } from './dto/diagnostic-order-query.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import {
  canCollectSample,
  canCompleteOrder,
  canEnterResult,
  canStartProcessing,
  isAllowedDiagnosticOrderTransition,
  isDiagnosticOrderCancellable,
} from './utils/diagnostic-order-transitions.util';

type AuthenticatedUser = {
  sub: string;
  hospitalId: string;
  branchId?: string | null;
};

const MAX_ORDER_NUMBER_RETRIES = 3;

const orderInclude = {
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
  encounter: {
    select: {
      id: true,
      encounterType: true,
      status: true,
      branchId: true,
    },
  },
  branch: {
    select: { id: true, name: true, code: true },
  },
  orderedBy: {
    select: { id: true, name: true, email: true },
  },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      resultedBy: {
        select: { id: true, name: true, email: true },
      },
      verifiedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  },
} satisfies Prisma.DiagnosticOrderInclude;

@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEventOutboxService: DomainEventOutboxService,
    private readonly departmentBillingEnqueue: DepartmentBillingEnqueueService,
  ) {}

  private async validatePatient(user: AuthenticatedUser, patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Patient not found');
    }

    if (patient.mergedIntoPatientId) {
      throw new BadRequestException('Patient record is not active');
    }

    if (patient.branchId != null) {
      assertBranchAccess(user, patient.branchId);
    }

    return patient;
  }

  private async validateBranch(user: AuthenticatedUser, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (branch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException('Branch does not belong to your hospital');
    }

    return branch;
  }

  private async findOwnedEncounter(user: AuthenticatedUser, encounterId: string) {
    const encounter = await this.prisma.clinicalEncounter.findUnique({
      where: { id: encounterId },
    });

    if (!encounter || encounter.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Clinical encounter not found');
    }

    assertBranchAccess(user, encounter.branchId);

    return encounter;
  }

  private async findOwnedOrder(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.diagnosticOrder.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });

    if (!order || order.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Diagnostic order not found');
    }

    assertBranchAccess(user, order.branchId);

    return order;
  }

  private async findOwnedOrderItem(user: AuthenticatedUser, itemId: string) {
    const item = await this.prisma.diagnosticOrderItem.findUnique({
      where: { id: itemId },
      include: {
        order: {
          include: orderInclude,
        },
      },
    });

    if (!item || item.hospitalId !== user.hospitalId) {
      throw new NotFoundException('Diagnostic order item not found');
    }

    assertBranchAccess(user, item.order.branchId);

    return item;
  }

  private assertTransition(
    currentStatus: DiagnosticOrderStatus,
    nextStatus: DiagnosticOrderStatus,
  ): void {
    if (!isAllowedDiagnosticOrderTransition(currentStatus, nextStatus)) {
      throw new BadRequestException(
        `Cannot transition diagnostic order from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private async generateOrderNumber(
    tx: Prisma.TransactionClient,
    hospitalId: string,
  ): Promise<string> {
    const lockKey = `diagnostic-order:${hospitalId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const latest = await tx.diagnosticOrder.findFirst({
      where: { hospitalId },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    let sequence = 1;

    if (latest?.orderNumber) {
      const match = /^LAB-(\d+)$/.exec(latest.orderNumber);

      if (match) {
        sequence = parseInt(match[1], 10) + 1;
      }
    }

    return `LAB-${String(sequence).padStart(6, '0')}`;
  }

  private formatOrder(
    order: Prisma.DiagnosticOrderGetPayload<{ include: typeof orderInclude }>,
  ) {
    return {
      id: order.id,
      hospitalId: order.hospitalId,
      branchId: order.branchId,
      patientId: order.patientId,
      encounterId: order.encounterId,
      orderNumber: order.orderNumber,
      status: order.status,
      priority: order.priority,
      orderedByUserId: order.orderedByUserId,
      orderedAt: order.orderedAt,
      sampleCollectedAt: order.sampleCollectedAt,
      completedAt: order.completedAt,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      patient: order.patient,
      encounter: order.encounter,
      branch: order.branch,
      orderedBy: order.orderedBy,
      items: order.items.map((item) => ({
        id: item.id,
        testCode: item.testCode,
        testName: item.testName,
        specimenType: item.specimenType,
        status: item.status,
        resultValue: item.resultValue,
        resultUnit: item.resultUnit,
        referenceRange: item.referenceRange,
        resultFlag: item.resultFlag,
        resultNotes: item.resultNotes,
        resultedAt: item.resultedAt,
        verifiedAt: item.verifiedAt,
        resultedBy: item.resultedBy,
        verifiedBy: item.verifiedBy,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    };
  }

  /**
   * Extension point after order completion. No outbound messaging or outbox emission here;
   * patient notifications use the domain-event pipeline separately when configured.
   */
  private async onDiagnosticOrderCompleted(
    order: Prisma.DiagnosticOrderGetPayload<{ include: typeof orderInclude }>,
  ): Promise<void> {
    void order;
  }

  async createOrder(user: AuthenticatedUser, dto: CreateDiagnosticOrderDto) {
    const encounter = await this.findOwnedEncounter(user, dto.encounterId);

    if (encounter.status === ClinicalEncounterStatus.CANCELLED) {
      throw new BadRequestException(
        'Diagnostic orders cannot be created for cancelled encounters',
      );
    }

    await this.validatePatient(user, encounter.patientId);

    if (!dto.tests?.length) {
      throw new BadRequestException('At least one test is required');
    }

    const priority = dto.priority ?? DiagnosticOrderPriority.NORMAL;

    let order;

    for (let attempt = 0; attempt < MAX_ORDER_NUMBER_RETRIES; attempt += 1) {
      try {
        order = await this.prisma.$transaction(async (tx) => {
          const orderNumber = await this.generateOrderNumber(tx, user.hospitalId);

          const created = await tx.diagnosticOrder.create({
            data: {
              hospitalId: user.hospitalId,
              branchId: encounter.branchId,
              patientId: encounter.patientId,
              encounterId: encounter.id,
              orderNumber,
              priority,
              orderedByUserId: user.sub,
              notes: dto.notes,
              items: {
                create: dto.tests.map((test) => ({
                  hospitalId: user.hospitalId,
                  testCode: test.testCode.trim(),
                  testName: test.testName.trim(),
                  specimenType: test.specimenType.trim(),
                  ...(test.billableUnitPrice != null && {
                    billableUnitPrice: roundMoney(
                      toDecimal(test.billableUnitPrice),
                    ),
                  }),
                })),
              },
            },
            include: orderInclude,
          });

          return created;
        });
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < MAX_ORDER_NUMBER_RETRIES - 1
        ) {
          continue;
        }

        throw error;
      }
    }

    if (!order) {
      throw new ConflictException('Failed to create diagnostic order');
    }

    const formatted = this.formatOrder(order);

    await this.auditService.log({
      action: 'DIAGNOSTIC_ORDER_CREATED',
      entity: 'DiagnosticOrder',
      entityId: formatted.id,
      hospitalId: user.hospitalId,
      branchId: formatted.branchId,
      userId: user.sub,
      metadata: {
        orderNumber: formatted.orderNumber,
        patientId: formatted.patientId,
        encounterId: formatted.encounterId,
        priority: formatted.priority,
        testCount: formatted.items.length,
      },
    });

    return formatted;
  }

  async listOrders(user: AuthenticatedUser, query: DiagnosticOrderQueryDto) {
    const where: Prisma.DiagnosticOrderWhereInput = {
      hospitalId: user.hospitalId,
    };

    if (query.patientId) {
      await this.validatePatient(user, query.patientId);
      where.patientId = query.patientId;
    }

    if (query.encounterId) {
      await this.findOwnedEncounter(user, query.encounterId);
      where.encounterId = query.encounterId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (user.branchId == null && query.branchId) {
      await this.validateBranch(user, query.branchId);
    }

    if (query.branchId) {
      where.branchId = query.branchId;
    }

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(`${query.date}T23:59:59.999Z`);
      where.orderedAt = { gte: start, lte: end };
    }

    const scopedWhere = applyBranchScope(user, where);

    const orders = await this.prisma.diagnosticOrder.findMany({
      where: scopedWhere,
      include: orderInclude,
      orderBy: { orderedAt: 'desc' },
    });

    return orders.map((order) => this.formatOrder(order));
  }

  async getOrder(user: AuthenticatedUser, orderId: string) {
    const order = await this.findOwnedOrder(user, orderId);

    await this.auditService.log({
      action: 'DIAGNOSTIC_ORDER_READ',
      entity: 'DiagnosticOrder',
      entityId: order.id,
      hospitalId: user.hospitalId,
      branchId: order.branchId,
      userId: user.sub,
      metadata: {
        patientId: order.patientId,
        orderNumber: order.orderNumber,
      },
    });

    return this.formatOrder(order);
  }

  async collectSample(user: AuthenticatedUser, orderId: string) {
    const order = await this.findOwnedOrder(user, orderId);

    if (!canCollectSample(order.status)) {
      throw new BadRequestException(
        `Sample collection is not allowed when order status is ${order.status}`,
      );
    }

    this.assertTransition(order.status, DiagnosticOrderStatus.SAMPLE_COLLECTED);

    const updated = await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: {
        status: DiagnosticOrderStatus.SAMPLE_COLLECTED,
        sampleCollectedAt: new Date(),
      },
      include: orderInclude,
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_SAMPLE_COLLECTED',
      entity: 'DiagnosticOrder',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        orderNumber: updated.orderNumber,
        previousStatus: order.status,
        newStatus: updated.status,
      },
    });

    return this.formatOrder(updated);
  }

  async startProcessing(user: AuthenticatedUser, orderId: string) {
    const order = await this.findOwnedOrder(user, orderId);

    if (!canStartProcessing(order.status)) {
      throw new BadRequestException(
        `Processing cannot start when order status is ${order.status}`,
      );
    }

    this.assertTransition(order.status, DiagnosticOrderStatus.PROCESSING);

    const updated = await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: { status: DiagnosticOrderStatus.PROCESSING },
      include: orderInclude,
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_PROCESSING_STARTED',
      entity: 'DiagnosticOrder',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        orderNumber: updated.orderNumber,
        previousStatus: order.status,
        newStatus: updated.status,
      },
    });

    return this.formatOrder(updated);
  }

  async enterResult(
    user: AuthenticatedUser,
    itemId: string,
    dto: EnterResultDto,
  ) {
    const item = await this.findOwnedOrderItem(user, itemId);
    const order = item.order;

    if (order.status === DiagnosticOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot receive results');
    }

    if (order.status === DiagnosticOrderStatus.COMPLETED) {
      throw new BadRequestException('Completed orders cannot be modified');
    }

    if (!canEnterResult(order.status)) {
      throw new BadRequestException(
        'Results can only be entered after sample collection',
      );
    }

    const updatedItem = await this.prisma.diagnosticOrderItem.update({
      where: { id: item.id },
      data: {
        resultValue: dto.resultValue.trim(),
        resultUnit: dto.resultUnit?.trim() ?? null,
        referenceRange: dto.referenceRange?.trim() ?? null,
        resultFlag: dto.resultFlag ?? null,
        resultNotes: dto.resultNotes?.trim() ?? null,
        resultedAt: new Date(),
        resultedByUserId: user.sub,
        status: DiagnosticOrderItemStatus.RESULTED,
        verifiedAt: null,
        verifiedByUserId: null,
      },
      include: {
        order: { include: orderInclude },
        resultedBy: { select: { id: true, name: true, email: true } },
        verifiedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_RESULT_ENTERED',
      entity: 'DiagnosticOrderItem',
      entityId: updatedItem.id,
      hospitalId: user.hospitalId,
      branchId: order.branchId,
      userId: user.sub,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        testCode: updatedItem.testCode,
        resultFlag: updatedItem.resultFlag,
      },
    });

    return {
      id: updatedItem.id,
      testCode: updatedItem.testCode,
      testName: updatedItem.testName,
      specimenType: updatedItem.specimenType,
      status: updatedItem.status,
      resultValue: updatedItem.resultValue,
      resultUnit: updatedItem.resultUnit,
      referenceRange: updatedItem.referenceRange,
      resultFlag: updatedItem.resultFlag,
      resultNotes: updatedItem.resultNotes,
      resultedAt: updatedItem.resultedAt,
      verifiedAt: updatedItem.verifiedAt,
      resultedBy: updatedItem.resultedBy,
      verifiedBy: updatedItem.verifiedBy,
      order: this.formatOrder(updatedItem.order),
    };
  }

  async verifyResult(user: AuthenticatedUser, itemId: string) {
    const item = await this.findOwnedOrderItem(user, itemId);
    const order = item.order;

    if (order.status === DiagnosticOrderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled orders cannot be verified');
    }

    if (!item.resultValue?.trim()) {
      throw new BadRequestException('Result must be entered before verification');
    }

    const updatedItem = await this.prisma.diagnosticOrderItem.update({
      where: { id: item.id },
      data: {
        verifiedAt: new Date(),
        verifiedByUserId: user.sub,
        status: DiagnosticOrderItemStatus.VERIFIED,
      },
      include: {
        order: { include: orderInclude },
        resultedBy: { select: { id: true, name: true, email: true } },
        verifiedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_RESULT_VERIFIED',
      entity: 'DiagnosticOrderItem',
      entityId: updatedItem.id,
      hospitalId: user.hospitalId,
      branchId: order.branchId,
      userId: user.sub,
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        testCode: updatedItem.testCode,
      },
    });

    return {
      id: updatedItem.id,
      testCode: updatedItem.testCode,
      testName: updatedItem.testName,
      specimenType: updatedItem.specimenType,
      status: updatedItem.status,
      resultValue: updatedItem.resultValue,
      resultUnit: updatedItem.resultUnit,
      referenceRange: updatedItem.referenceRange,
      resultFlag: updatedItem.resultFlag,
      resultNotes: updatedItem.resultNotes,
      resultedAt: updatedItem.resultedAt,
      verifiedAt: updatedItem.verifiedAt,
      resultedBy: updatedItem.resultedBy,
      verifiedBy: updatedItem.verifiedBy,
      order: this.formatOrder(updatedItem.order),
    };
  }

  async completeOrder(user: AuthenticatedUser, orderId: string) {
    const order = await this.findOwnedOrder(user, orderId);

    if (!canCompleteOrder(order.status)) {
      throw new BadRequestException(
        `Order cannot be completed when status is ${order.status}`,
      );
    }

    const missingResults = order.items.filter(
      (item) => !item.resultValue?.trim(),
    );

    if (missingResults.length > 0) {
      throw new BadRequestException(
        'All order items must have results before completion',
      );
    }

    this.assertTransition(order.status, DiagnosticOrderStatus.COMPLETED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const persisted = await tx.diagnosticOrder.update({
        where: { id: order.id },
        data: {
          status: DiagnosticOrderStatus.COMPLETED,
          completedAt: new Date(),
        },
        include: orderInclude,
      });

      const completedEvent = buildDiagnosticOrderCompletedDomainEvent({
        diagnosticOrderId: persisted.id,
        orderNumber: persisted.orderNumber,
        patientId: persisted.patientId,
        hospitalId: persisted.hospitalId,
        branchId: persisted.branchId,
        completedByUserId: user.sub,
        itemCount: persisted.items.length,
      });

      const outbox = await this.domainEventOutboxService.createInTransaction(
        tx,
        completedEvent,
      );

      await this.domainEventOutboxService.enqueueDispatchInTransaction(tx, {
        hospitalId: persisted.hospitalId,
        branchId: persisted.branchId,
        outboxId: outbox.id,
      });

      const billingEvent = buildDiagnosticOrderBillingEvent({
        diagnosticOrderId: persisted.id,
        patientId: persisted.patientId,
        hospitalId: persisted.hospitalId,
        branchId: persisted.branchId,
      });

      await this.departmentBillingEnqueue.enqueueInTransaction(tx, {
        event: billingEvent,
        jobType: JOB_TYPES.BILLING_DEPARTMENT_PROCESS,
        jobIdempotencyKey: departmentBillingJobKey(
          JOB_TYPES.BILLING_DEPARTMENT_PROCESS,
          persisted.id,
        ),
      });

      await this.auditService.logInTransaction(tx, {
        action: 'DIAGNOSTIC_ORDER_COMPLETED',
        entity: 'DiagnosticOrder',
        entityId: persisted.id,
        hospitalId: user.hospitalId,
        branchId: persisted.branchId,
        userId: user.sub,
        metadata: {
          orderNumber: persisted.orderNumber,
          previousStatus: order.status,
          newStatus: persisted.status,
          itemCount: persisted.items.length,
        },
      });

      return persisted;
    });

    await this.onDiagnosticOrderCompleted(updated);

    return this.formatOrder(updated);
  }

  async cancelOrder(user: AuthenticatedUser, orderId: string) {
    const order = await this.findOwnedOrder(user, orderId);

    if (!isDiagnosticOrderCancellable(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled when status is ${order.status}`,
      );
    }

    this.assertTransition(order.status, DiagnosticOrderStatus.CANCELLED);

    const updated = await this.prisma.diagnosticOrder.update({
      where: { id: order.id },
      data: { status: DiagnosticOrderStatus.CANCELLED },
      include: orderInclude,
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_ORDER_CANCELLED',
      entity: 'DiagnosticOrder',
      entityId: updated.id,
      hospitalId: user.hospitalId,
      branchId: updated.branchId,
      userId: user.sub,
      metadata: {
        orderNumber: updated.orderNumber,
        previousStatus: order.status,
        newStatus: updated.status,
      },
    });

    return this.formatOrder(updated);
  }

  private mapPatientDiagnosticOrders(
    patientId: string,
    orders: Prisma.DiagnosticOrderGetPayload<{ include: typeof orderInclude }>[],
  ) {
    return {
      patientId,
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        orderedAt: order.orderedAt,
        status: order.status,
        priority: order.priority,
        encounterId: order.encounterId,
        branchId: order.branchId,
        tests: order.items.map((item) => ({
          id: item.id,
          testCode: item.testCode,
          testName: item.testName,
          status: item.status,
          resultValue: item.resultValue,
          resultFlag: item.resultFlag,
          verifiedAt: item.verifiedAt,
        })),
      })),
    };
  }

  async getPatientDiagnostics(user: AuthenticatedUser, patientId: string) {
    await this.validatePatient(user, patientId);

    const orders = await this.prisma.diagnosticOrder.findMany({
      where: applyBranchScope(user, {
        hospitalId: user.hospitalId,
        patientId,
      }),
      include: orderInclude,
      orderBy: { orderedAt: 'desc' },
    });

    await this.auditService.log({
      action: 'DIAGNOSTIC_PATIENT_LIST_READ',
      entity: 'Patient',
      entityId: patientId,
      hospitalId: user.hospitalId,
      branchId: user.branchId ?? null,
      userId: user.sub,
      metadata: { orderCount: orders.length },
    });

    return this.mapPatientDiagnosticOrders(patientId, orders);
  }

  async getPatientDiagnosticsForPortal(
    scope: { hospitalId: string; branchId: string | null },
    patientId: string,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.hospitalId !== scope.hospitalId) {
      throw new NotFoundException('Patient not found');
    }
    if (scope.branchId != null && patient.branchId !== scope.branchId) {
      throw new ForbiddenException('Access to this branch is not permitted');
    }
    if (patient.mergedIntoPatientId) {
      throw new BadRequestException('Patient record is not active');
    }

    const orders = await this.prisma.diagnosticOrder.findMany({
      where: {
        hospitalId: scope.hospitalId,
        patientId,
      },
      include: orderInclude,
      orderBy: { orderedAt: 'desc' },
    });

    await this.auditService.log({
      action: 'PORTAL_DIAGNOSTIC_LIST_READ',
      entity: 'Patient',
      entityId: patientId,
      hospitalId: scope.hospitalId,
      branchId: scope.branchId,
      userId: null,
      metadata: { orderCount: orders.length, channel: 'patient_portal' },
    });

    return this.mapPatientDiagnosticOrders(patientId, orders);
  }
}
