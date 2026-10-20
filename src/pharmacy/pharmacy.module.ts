import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PharmacyDispensingBillingJobModule } from '../billing/pharmacy-dispensing-billing-job.module';
import { CommonModule } from '../common/common.module';
import { PharmacyBatchController } from './pharmacy-batch.controller';
import { PharmacyDispensingController } from './pharmacy-dispensing.controller';
import { PharmacyProductController } from './pharmacy-product.controller';
import { PharmacyStockController } from './pharmacy-stock.controller';
import { PharmacyService } from './pharmacy.service';

@Module({
  imports: [CommonModule, AuditModule, PharmacyDispensingBillingJobModule],
  controllers: [
    PharmacyProductController,
    PharmacyBatchController,
    PharmacyStockController,
    PharmacyDispensingController,
  ],
  providers: [PharmacyService],
  exports: [PharmacyService],
})
export class PharmacyModule {}
