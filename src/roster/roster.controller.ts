import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRosterEntryDto } from './dto/create-roster-entry.dto';
import { RosterEntryQueryDto } from './dto/roster-entry-query.dto';
import { UpdateRosterEntryDto } from './dto/update-roster-entry.dto';
import { RosterService } from './roster.service';

@Controller('roster-entries')
@UseGuards(JwtAuthGuard)
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateRosterEntryDto) {
    return this.rosterService.create(req.user, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: RosterEntryQueryDto) {
    return this.rosterService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.rosterService.findOne(req.user, id);
  }

  @Patch(':id')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRosterEntryDto,
  ) {
    return this.rosterService.update(req.user, id, dto);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.rosterService.remove(req.user, id);
  }
}
