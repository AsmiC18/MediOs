import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttendanceService } from './attendance.service';
import { AttendanceQueryDto } from './dto/attendance-query.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  clockIn(@Request() req: any) {
    return this.attendanceService.clockIn(req.user);
  }

  @Post('clock-out')
  clockOut(@Request() req: any) {
    return this.attendanceService.clockOut(req.user);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: AttendanceQueryDto) {
    return this.attendanceService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.attendanceService.findOne(req.user, id);
  }
}
