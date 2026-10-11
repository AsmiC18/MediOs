import {

  Body,

  Controller,

  Get,

  Param,

  Patch,

  Post,

  Request,

  UseGuards,

} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { PermissionsGuard } from '../auth/guards/permissions.guard';

import { RequirePermissions } from '../auth/decorators/permissions.decorator';

import { AbdmConfigService } from './abdm-config.service';

import { AbdmEnvironmentService } from './abdm-environment.service';

import { AbdmHfrService } from './abdm-hfr.service';

import { AbdmHprService } from './abdm-hpr.service';

import { AbdmProfessionalService } from './abdm-professional.service';

import { LinkHfrDto } from './dto/link-hfr.dto';

import { LinkHprDto } from './dto/link-hpr.dto';

import { SearchHfrDto } from './dto/search-hfr.dto';

import { UpdateAbdmConfigDto } from './dto/update-abdm-config.dto';

import { UpdateAbdmProfessionalDto } from './dto/update-abdm-professional.dto';

import { FeatureGuard } from '../plans/feature.guard';
import { RequireFeature } from '../plans/require-feature.decorator';
import { FeatureKey } from '../plans/feature-keys';

@Controller('abdm')

@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.ABDM)

export class AbdmController {

  constructor(

    private readonly configService: AbdmConfigService,

    private readonly environmentService: AbdmEnvironmentService,

    private readonly hfrService: AbdmHfrService,

  ) {}



  @Get('config')

  @RequirePermissions('abdm:read')

  getConfig(@Request() req: any) {

    return this.configService.getConfig(req.user);

  }



  @Patch('config')

  @RequirePermissions('abdm:manage')

  updateConfig(@Request() req: any, @Body() dto: UpdateAbdmConfigDto) {

    return this.configService.updateConfig(req.user, dto);

  }



  @Get('environment')

  @RequirePermissions('abdm:read')

  getEnvironment() {

    return this.environmentService.getEnvironmentInfo();

  }



  @Get('hfr')

  @RequirePermissions('abdm:read')

  getHfr(@Request() req: any) {

    return this.hfrService.getHfr(req.user);

  }



  @Post('hfr/link')

  @RequirePermissions('abdm:manage')

  linkHfr(@Request() req: any, @Body() dto: LinkHfrDto) {

    return this.hfrService.linkHfr(req.user, dto);

  }



  @Post('hfr/search')

  @RequirePermissions('abdm:read')

  searchHfr(@Request() req: any, @Body() dto: SearchHfrDto) {

    return this.hfrService.searchHfr(req.user, dto);

  }



  @Post('hfr/sync')

  @RequirePermissions('abdm:manage')

  syncHfr(@Request() req: any) {

    return this.hfrService.syncHfr(req.user);

  }

}



@Controller('users')

@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.ABDM)

export class AbdmUserController {

  constructor(

    private readonly professionalService: AbdmProfessionalService,

    private readonly hprService: AbdmHprService,

  ) {}



  @Get(':id/abdm/hpr')

  @RequirePermissions('abdm:read')

  getHprLink(@Request() req: any, @Param('id') id: string) {

    return this.hprService.getHprLink(req.user, id);

  }



  @Post(':id/abdm/hpr/link')

  @RequirePermissions('abdm:manage')

  linkHpr(

    @Request() req: any,

    @Param('id') id: string,

    @Body() dto: LinkHprDto,

  ) {

    return this.hprService.linkHpr(req.user, id, dto);

  }



  @Post(':id/abdm/hpr/sync')

  @RequirePermissions('abdm:manage')

  syncHpr(@Request() req: any, @Param('id') id: string) {

    return this.hprService.syncHpr(req.user, id);

  }



  @Get(':id/abdm')

  @RequirePermissions('abdm:read')

  getProfessionalLink(@Request() req: any, @Param('id') id: string) {

    return this.professionalService.getProfessionalLink(req.user, id);

  }



  @Patch(':id/abdm')

  @RequirePermissions('abdm:manage')

  updateProfessionalLink(

    @Request() req: any,

    @Param('id') id: string,

    @Body() dto: UpdateAbdmProfessionalDto,

  ) {

    return this.professionalService.updateProfessionalLink(req.user, id, dto);

  }

}


