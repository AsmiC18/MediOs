import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { WorkSchedulesService } from './work-schedules.service';

@Controller('work-schedules')
@UseGuards(JwtAuthGuard)
export class WorkSchedulesController {
  constructor(private readonly workSchedulesService: WorkSchedulesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateWorkScheduleDto) {
    return this.workSchedulesService.create(req.user, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.workSchedulesService.findAll(req.user);
  }

  @Patch('branch/:branchId/remove')
  removeBranchOverride(
    @Request() req: any,
    @Param('branchId') branchId: string,
  ) {
    return this.workSchedulesService.removeBranchOverride(req.user, branchId);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.workSchedulesService.findOne(req.user, id);
  }

  @Patch(':id/set-hospital-default')
  setHospitalDefault(@Request() req: any, @Param('id') id: string) {
    return this.workSchedulesService.setHospitalDefault(req.user, id);
  }

  @Patch(':id/assign-branch/:branchId')
  assignBranch(
    @Request() req: any,
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    return this.workSchedulesService.assignBranch(req.user, id, branchId);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateWorkScheduleDto,
  ) {
    return this.workSchedulesService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.workSchedulesService.remove(req.user, id);
  }
}
