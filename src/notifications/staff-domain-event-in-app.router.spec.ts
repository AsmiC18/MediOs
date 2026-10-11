import { DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE } from '../diagnostics/diagnostic-order-completed-event.util';
import { APPOINTMENT_REMINDER_24H_EVENT_TYPE } from '../scheduling/appointments/appointment-reminder-24h-event.util';
import { StaffDomainEventInAppRouterService } from './staff-domain-event-in-app.router.service';

describe('StaffDomainEventInAppRouterService', () => {
  it('routes diagnostic completion to staff with diagnostics:read', async () => {
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const staffInApp = {
      createFromDispatch: jest.fn().mockResolvedValue({ id: 'n1' }),
    };
    const prisma = {
      permission: {
        findUnique: jest.fn().mockResolvedValue({ id: 'perm-1' }),
      },
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([{ roleId: 'role-1' }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'staff-1' }]),
      },
      staffInAppNotification: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const router = new StaffDomainEventInAppRouterService(
      prisma as never,
      staffInApp as never,
      auditService as never,
    );

    const created = await router.routeFromOutbox({
      id: 'outbox-1',
      hospitalId: 'h1',
      branchId: 'b1',
      eventType: DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE,
      entityType: 'DiagnosticOrder',
      entityId: 'order-1',
      payload: { summary: 'Order ORD-1 completed (2 test(s)).' },
    } as never);

    expect(created).toBe(1);
    expect(staffInApp.createFromDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'staff-1',
        category: DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE,
        entityId: 'outbox-1',
      }),
    );
  });

  it('skips duplicate staff notifications for the same outbox and user', async () => {
    const staffInApp = { createFromDispatch: jest.fn() };
    const prisma = {
      permission: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      rolePermission: { findMany: jest.fn().mockResolvedValue([{ roleId: 'r1' }]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
      staffInAppNotification: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
      },
    };
    const router = new StaffDomainEventInAppRouterService(
      prisma as never,
      staffInApp as never,
      { log: jest.fn() } as never,
    );

    const created = await router.routeFromOutbox({
      id: 'outbox-dup',
      hospitalId: 'h1',
      branchId: null,
      eventType: DIAGNOSTIC_ORDER_COMPLETED_EVENT_TYPE,
      entityType: 'DiagnosticOrder',
      entityId: 'order-1',
      payload: {},
    } as never);

    expect(created).toBe(0);
    expect(staffInApp.createFromDispatch).not.toHaveBeenCalled();
  });

  it('routes appointment reminder events to staff with scheduling:read', async () => {
    const staffInApp = {
      createFromDispatch: jest.fn().mockResolvedValue({ id: 'n-rem' }),
    };
    const prisma = {
      permission: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }) },
      rolePermission: { findMany: jest.fn().mockResolvedValue([{ roleId: 'r1' }]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
      staffInAppNotification: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const router = new StaffDomainEventInAppRouterService(
      prisma as never,
      staffInApp as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const created = await router.routeFromOutbox({
      id: 'outbox-rem',
      hospitalId: 'h1',
      branchId: 'b1',
      eventType: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
      entityType: 'Appointment',
      entityId: 'appt-1',
      payload: { text: 'Reminder: visit tomorrow at 10:00 UTC.' },
    } as never);

    expect(created).toBe(1);
    expect(staffInApp.createFromDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: APPOINTMENT_REMINDER_24H_EVENT_TYPE,
        title: 'Appointment reminder (24h)',
      }),
    );
  });
});
