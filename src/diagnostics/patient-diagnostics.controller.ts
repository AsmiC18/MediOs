import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { DiagnosticsService } from './diagnostics.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientDiagnosticsController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Get(':id/diagnostics')
  @RequirePermissions('diagnostics:read')
  getPatientDiagnostics(@Request() req: any, @Param('id') id: string) {
    return this.diagnosticsService.getPatientDiagnostics(req.user, id);
  }
}
