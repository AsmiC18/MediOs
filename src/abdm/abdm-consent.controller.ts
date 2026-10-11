import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { AbdmConsentService } from './abdm-consent.service';
import { ConsentQueryDto } from './dto/consent-query.dto';
import { CreateConsentDto } from './dto/create-consent.dto';
import { UpdateConsentStatusDto } from './dto/update-consent-status.dto';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.ABDM)
export class AbdmConsentController {
  constructor(private readonly consentService: AbdmConsentService) {}

  @Post('patients/:id/abdm/consents')
  @RequirePermissions('abdm:consent:manage')
  createConsent(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateConsentDto,
  ) {
    return this.consentService.createConsent(req.user, id, dto);
  }

  @Get('patients/:id/abdm/consents/active')
  @RequirePermissions('abdm:consent:read')
  getActiveConsent(
    @Request() req: any,
    @Param('id') id: string,
    @Query('purpose') purpose: string,
  ) {
    if (!purpose?.trim()) {
      throw new BadRequestException('purpose query parameter is required');
    }

    return this.consentService.findActiveConsent(req.user, id, purpose.trim());
  }

  @Get('patients/:id/abdm/consents')
  @RequirePermissions('abdm:consent:read')
  listConsents(
    @Request() req: any,
    @Param('id') id: string,
    @Query() query: ConsentQueryDto,
  ) {
    return this.consentService.listConsents(req.user, id, query);
  }

  @Get('abdm/consents/:id')
  @RequirePermissions('abdm:consent:read')
  getConsent(@Request() req: any, @Param('id') id: string) {
    return this.consentService.getConsent(req.user, id);
  }

  @Patch('abdm/consents/:id/status')
  @RequirePermissions('abdm:consent:manage')
  updateConsentStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateConsentStatusDto,
  ) {
    return this.consentService.updateConsentStatus(req.user, id, dto);
  }

  @Get('abdm/consents/:id/audit-log')
  @RequirePermissions('abdm:consent:read')
  getConsentAuditLog(@Request() req: any, @Param('id') id: string) {
    return this.consentService.getConsentAuditLog(req.user, id);
  }
}
