import {
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
import {
  BatchQueryDto,
  CreateBatchDto,
  UpdateBatchDto,
} from './dto/create-batch.dto';
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy/batches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyBatchController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Post()
  @RequirePermissions('pharmacy:manage')
  createBatch(@Request() req: any, @Body() dto: CreateBatchDto) {
    return this.pharmacyService.createBatch(req.user, dto);
  }

  @Get()
  @RequirePermissions('pharmacy:read')
  listBatches(@Request() req: any, @Query() query: BatchQueryDto) {
    return this.pharmacyService.listBatches(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('pharmacy:read')
  getBatch(@Request() req: any, @Param('id') id: string) {
    return this.pharmacyService.getBatch(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('pharmacy:manage')
  updateBatch(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.pharmacyService.updateBatch(req.user, id, dto);
  }
}
