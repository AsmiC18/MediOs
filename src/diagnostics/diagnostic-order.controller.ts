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
import { DiagnosticsService } from './diagnostics.service';
import { CreateDiagnosticOrderDto } from './dto/create-diagnostic-order.dto';
import { DiagnosticOrderQueryDto } from './dto/diagnostic-order-query.dto';

@Controller('diagnostics/orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DiagnosticOrderController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Post()
  @RequirePermissions('diagnostics:manage')
  createOrder(@Request() req: any, @Body() dto: CreateDiagnosticOrderDto) {
    return this.diagnosticsService.createOrder(req.user, dto);
  }

  @Get()
  @RequirePermissions('diagnostics:read')
  listOrders(@Request() req: any, @Query() query: DiagnosticOrderQueryDto) {
    return this.diagnosticsService.listOrders(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('diagnostics:read')
  getOrder(@Request() req: any, @Param('id') id: string) {
    return this.diagnosticsService.getOrder(req.user, id);
  }

  @Post(':id/collect-sample')
  @RequirePermissions('diagnostics:manage')
  collectSample(@Request() req: any, @Param('id') id: string) {
    return this.diagnosticsService.collectSample(req.user, id);
  }

  @Post(':id/start-processing')
  @RequirePermissions('diagnostics:manage')
  startProcessing(@Request() req: any, @Param('id') id: string) {
    return this.diagnosticsService.startProcessing(req.user, id);
  }

  @Post(':id/complete')
  @RequirePermissions('diagnostics:manage')
  completeOrder(@Request() req: any, @Param('id') id: string) {
    return this.diagnosticsService.completeOrder(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('diagnostics:manage')
  cancelOrder(@Request() req: any, @Param('id') id: string) {
    return this.diagnosticsService.cancelOrder(req.user, id);
  }
}
