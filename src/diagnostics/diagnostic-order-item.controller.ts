import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { DiagnosticsService } from './diagnostics.service';
import { EnterResultDto } from './dto/enter-result.dto';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('diagnostics/order-items')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.DIAGNOSTICS)
export class DiagnosticOrderItemController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Patch(':id/result')
  @RequirePermissions('diagnostics:manage')
  enterResult(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: EnterResultDto,
  ) {
    return this.diagnosticsService.enterResult(req.user, id, dto);
  }

  @Post(':id/verify')
  @RequirePermissions('diagnostics:manage')
  verifyResult(@Request() req: any, @Param('id') id: string) {
    return this.diagnosticsService.verifyResult(req.user, id);
  }
}
