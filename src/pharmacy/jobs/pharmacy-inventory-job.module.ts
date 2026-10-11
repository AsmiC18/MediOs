import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PharmacyExpiryScanHandler } from './pharmacy-expiry-scan.handler';
import { PharmacyInventoryScanService } from './pharmacy-inventory-scan.service';
import { PharmacyLowStockScanHandler } from './pharmacy-low-stock-scan.handler';

@Module({
  imports: [CommonModule, NotificationsModule],
  providers: [
    PharmacyInventoryScanService,
    PharmacyLowStockScanHandler,
    PharmacyExpiryScanHandler,
  ],
  exports: [
    PharmacyInventoryScanService,
    PharmacyLowStockScanHandler,
    PharmacyExpiryScanHandler,
  ],
})
export class PharmacyInventoryJobModule {}
