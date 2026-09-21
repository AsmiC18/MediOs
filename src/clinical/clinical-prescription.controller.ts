import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ClinicalService } from './clinical.service';
import { UpdatePrescriptionStatusDto } from './dto/update-prescription-status.dto';

@Controller('clinical/prescriptions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalPrescriptionController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Get(':id')
  @RequirePermissions('clinical:read')
  getPrescription(@Request() req: any, @Param('id') id: string) {
    return this.clinicalService.getPrescription(req.user, id);
  }

  @Patch(':id/status')
  @RequirePermissions('clinical:manage')
  updatePrescriptionStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePrescriptionStatusDto,
  ) {
    return this.clinicalService.updatePrescriptionStatus(req.user, id, dto);
  }
}
