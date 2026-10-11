import { JobPermanentFailureError } from '../jobs/job-permanent-failure.error';
import { DepartmentBillingProcessService } from './department/department-billing-process.service';
import { StaffAttendanceConsultationService } from './staff-attendance-consultation.service';

describe('StaffAttendanceConsultationService', () => {
  it('delegates to department billing processor', async () => {
    const departmentBillingProcessService = {
      processOutboxEvent: jest.fn().mockResolvedValue({
        outcome: 'created',
        invoiceId: 'inv-1',
      }),
    };

    const service = new StaffAttendanceConsultationService(
      departmentBillingProcessService as unknown as DepartmentBillingProcessService,
    );

    const result = await service.processOutboxEvent('h1', 'outbox-1', {
      jobId: 'job-1',
      workerId: 'worker-1',
    });

    expect(result.outcome).toBe('created');
    expect(departmentBillingProcessService.processOutboxEvent).toHaveBeenCalled();
  });

  it('propagates permanent failures from department billing', async () => {
    const departmentBillingProcessService = {
      processOutboxEvent: jest
        .fn()
        .mockRejectedValue(new JobPermanentFailureError('fee missing')),
    };

    const service = new StaffAttendanceConsultationService(
      departmentBillingProcessService as unknown as DepartmentBillingProcessService,
    );

    await expect(
      service.processOutboxEvent('h1', 'outbox-1', {
        jobId: 'job-1',
        workerId: 'worker-1',
      }),
    ).rejects.toThrow(JobPermanentFailureError);
  });
});
