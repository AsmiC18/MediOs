import { Injectable, NotFoundException } from '@nestjs/common';
import { DepartmentBillingProcessService } from './department/department-billing-process.service';

export type StaffAttendanceConsultationProcessResult = {
  outcome: 'created' | 'already_processed' | 'skipped_invalid';
  invoiceId?: string;
  invoiceItemId?: string;
};

@Injectable()
export class StaffAttendanceConsultationService {
  constructor(
    private readonly departmentBillingProcessService: DepartmentBillingProcessService,
  ) {}

  async processOutboxEvent(
    hospitalId: string,
    outboxId: string,
    jobContext: { jobId: string; workerId: string },
  ): Promise<StaffAttendanceConsultationProcessResult> {
    try {
      const result =
        await this.departmentBillingProcessService.processOutboxEvent(
          hospitalId,
          outboxId,
          jobContext,
        );
      return {
        outcome:
          result.outcome === 'skipped' ? 'skipped_invalid' : result.outcome,
        invoiceId: result.invoiceId,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
  }
}
