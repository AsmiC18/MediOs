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
import { BookingRulesService } from './booking-rules.service';
import { CreateBookingRuleDto } from './dto/create-booking-rule.dto';
import { UpdateBookingRuleDto } from './dto/update-booking-rule.dto';

@Controller('booking-rules')
@UseGuards(JwtAuthGuard)
export class BookingRulesController {
  constructor(private readonly bookingRulesService: BookingRulesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateBookingRuleDto) {
    return this.bookingRulesService.create(req.user, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.bookingRulesService.findAll(req.user);
  }

  @Patch('branch/:branchId/remove')
  removeBranchOverride(
    @Request() req: any,
    @Param('branchId') branchId: string,
  ) {
    return this.bookingRulesService.removeBranchOverride(req.user, branchId);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.bookingRulesService.findOne(req.user, id);
  }

  @Patch(':id/set-hospital-default')
  setHospitalDefault(@Request() req: any, @Param('id') id: string) {
    return this.bookingRulesService.setHospitalDefault(req.user, id);
  }

  @Patch(':id/assign-branch/:branchId')
  assignBranch(
    @Request() req: any,
    @Param('id') id: string,
    @Param('branchId') branchId: string,
  ) {
    return this.bookingRulesService.assignBranch(req.user, id, branchId);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBookingRuleDto,
  ) {
    return this.bookingRulesService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.bookingRulesService.remove(req.user, id);
  }
}
