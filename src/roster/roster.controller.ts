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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CreateRosterEntryDto } from './dto/create-roster-entry.dto';
import { RosterEntryQueryDto } from './dto/roster-entry-query.dto';
import { UpdateRosterEntryDto } from './dto/update-roster-entry.dto';
import { RosterService } from './roster.service';
import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('roster-entries')
@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SCHEDULING)
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @Post()
  @RequirePermissions('roster:manage')
  create(@Request() req: any, @Body() dto: CreateRosterEntryDto) {
    return this.rosterService.create(req.user, dto);
  }

  @Get()
  @RequirePermissions('roster:read')
  findAll(@Request() req: any, @Query() query: RosterEntryQueryDto) {
    return this.rosterService.findAll(req.user, query);
  }

  @Get(':id')
  @RequirePermissions('roster:read')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.rosterService.findOne(req.user, id);
  }

  @Patch(':id')
  @RequirePermissions('roster:manage')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRosterEntryDto,
  ) {
    return this.rosterService.update(req.user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('roster:manage')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.rosterService.remove(req.user, id);
  }
}
