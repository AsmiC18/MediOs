import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { JobModule } from '../../jobs/job.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PharmacyPrescriptionProcessJobHandler } from './pharmacy-prescription-process.job-handler';
import { PharmacyPrescriptionProcessService } from './pharmacy-prescription-process.service';

@Module({
  imports: [CommonModule, JobModule, NotificationsModule],
  providers: [
    PharmacyPrescriptionProcessService,
    PharmacyPrescriptionProcessJobHandler,
  ],
  exports: [
    PharmacyPrescriptionProcessService,
    PharmacyPrescriptionProcessJobHandler,
  ],
})
export class PharmacyPrescriptionProcessJobModule {}
