import {
  Body,
  Controller,
  Delete,
  Patch,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ClinicalService } from './clinical.service';
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';

@Controller('clinical/diagnoses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalDiagnosisController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Patch(':id')
  @RequirePermissions('clinical:manage')
  updateDiagnosis(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDiagnosisDto,
  ) {
    return this.clinicalService.updateDiagnosis(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clinical:manage')
  deleteDiagnosis(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.deleteDiagnosis(req.user, id);
  }
}
