import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  CreateDispensingDto,
  DispensingQueryDto,
} from './dto/create-dispensing.dto';
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy/dispensings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyDispensingController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Post()
  @RequirePermissions('pharmacy:manage')
  createDispensing(@Request() req: any, @Body() dto: CreateDispensingDto) {
    return this.pharmacyService.createDispensing(req.user, dto);
  }

  @Get()
  @RequirePermissions('pharmacy:read')
  listDispensings(@Request() req: any, @Query() query: DispensingQueryDto) {
    return this.pharmacyService.listDispensings(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('pharmacy:read')
  getDispensing(@Request() req: any, @Param('id') id: string) {
    return this.pharmacyService.getDispensing(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('pharmacy:manage')
  cancelDispensing(@Request() req: any, @Param('id') id: string) {
    return this.pharmacyService.cancelDispensing(req.user, id);
  }
}
