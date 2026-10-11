import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { LinkAbhaDto } from './dto/link-abha.dto';
import { VerifyAbhaDto } from './dto/verify-abha.dto';
import { PatientAbhaService } from './patient-abha.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.ABDM)
export class PatientAbhaController {
  constructor(private readonly patientAbhaService: PatientAbhaService) {}

  @Get(':id/abha')
  @RequirePermissions('abdm:read')
  getAbhaLink(@Request() req: any, @Param('id') id: string) {
    return this.patientAbhaService.getAbhaLink(req.user, id);
  }

  @Post(':id/abha/link')
  @RequirePermissions('abdm:manage')
  linkAbha(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: LinkAbhaDto,
  ) {
    return this.patientAbhaService.linkAbha(req.user, id, dto);
  }

  @Post(':id/abha/unlink')
  @RequirePermissions('abdm:manage')
  unlinkAbha(@Request() req: any, @Param('id') id: string) {
    return this.patientAbhaService.unlinkAbha(req.user, id);
  }

  @Post(':id/abha/verify')
  @RequirePermissions('abdm:manage')
  verifyAbha(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: VerifyAbhaDto,
  ) {
    return this.patientAbhaService.verifyAbha(req.user, id, dto);
  }
}
