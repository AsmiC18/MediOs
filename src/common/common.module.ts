import { Global, Module } from '@nestjs/common';
import { FieldEncryptionService } from './crypto/field-encryption.service';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Global()
@Module({
  imports: [RateLimitModule],
  controllers: [HealthController],
  providers: [PrismaService, FieldEncryptionService],
  exports: [PrismaService, RateLimitModule, FieldEncryptionService],
})
export class CommonModule {}
