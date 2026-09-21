import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreatePostOpRecordDto, UpdatePostOpRecordDto } from './dto/post-op.dto';
import { CreatePreOpAssessmentDto } from './dto/pre-op.dto';
import {
  CreateProcedureRecordDto,
  UpdateProcedureRecordDto,
} from './dto/procedure.dto';
import {
  CancelSurgeryRequestDto,
  CreateSurgeryRequestDto,
  SurgeryRequestQueryDto,
} from './dto/request.dto';
import { ScheduleSurgeryDto } from './dto/schedule.dto';
import { SurgeryService } from './surgery.service';

@Controller('surgery/requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SurgeryRequestController {
  constructor(private readonly surgeryService: SurgeryService) {}

  @Post()
  @RequirePermissions('surgery:manage')
  create(@Request() req: any, @Body() dto: CreateSurgeryRequestDto) {
    return this.surgeryService.createRequest(req.user, dto);
  }

  @Get()
  @RequirePermissions('surgery:read')
  list(@Request() req: any, @Query() query: SurgeryRequestQueryDto) {
    return this.surgeryService.listRequests(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('surgery:read')
  get(@Request() req: any, @Param('id') id: string) {
    return this.surgeryService.getRequest(req.user, id);
  }

  @Post(':id/pre-op')
  @RequirePermissions('surgery:manage')
  recordPreOp(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreatePreOpAssessmentDto,
  ) {
    return this.surgeryService.recordPreOp(req.user, id, dto);
  }

  @Get(':id/pre-op')
  @RequirePermissions('surgery:read')
  getPreOp(@Request() req: any, @Param('id') id: string) {
    return this.surgeryService.getPreOp(req.user, id);
  }

  @Post(':id/schedule')
  @RequirePermissions('surgery:manage')
  schedule(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ScheduleSurgeryDto,
  ) {
    return this.surgeryService.scheduleRequest(req.user, id, dto);
  }

  @Post(':id/start')
  @RequirePermissions('surgery:manage')
  start(@Request() req: any, @Param('id') id: string) {
    return this.surgeryService.startRequest(req.user, id);
  }

  @Post(':id/complete')
  @RequirePermissions('surgery:manage')
  complete(@Request() req: any, @Param('id') id: string) {
    return this.surgeryService.completeRequest(req.user, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('surgery:manage')
  cancel(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CancelSurgeryRequestDto,
  ) {
    return this.surgeryService.cancelRequest(req.user, id, dto);
  }

  @Post(':id/procedure')
  @RequirePermissions('surgery:manage')
  createProcedure(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateProcedureRecordDto,
  ) {
    return this.surgeryService.createProcedureRecord(req.user, id, dto);
  }

  @Get(':id/procedure')
  @RequirePermissions('surgery:read')
  getProcedure(@Request() req: any, @Param('id') id: string) {
    return this.surgeryService.getProcedureRecord(req.user, id);
  }

  @Patch(':id/procedure')
  @RequirePermissions('surgery:manage')
  updateProcedure(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateProcedureRecordDto,
  ) {
    return this.surgeryService.updateProcedureRecord(req.user, id, dto);
  }

  @Post(':id/post-op')
  @RequirePermissions('surgery:manage')
  createPostOp(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreatePostOpRecordDto,
  ) {
    return this.surgeryService.createPostOpRecord(req.user, id, dto);
  }

  @Get(':id/post-op')
  @RequirePermissions('surgery:read')
  getPostOp(@Request() req: any, @Param('id') id: string) {
    return this.surgeryService.getPostOpRecord(req.user, id);
  }

  @Patch(':id/post-op')
  @RequirePermissions('surgery:manage')
  updatePostOp(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePostOpRecordDto,
  ) {
    return this.surgeryService.updatePostOpRecord(req.user, id, dto);
  }
}
