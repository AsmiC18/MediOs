import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { RefreshRateLimitGuard } from '../../auth/guards/refresh-rate-limit.guard';
import { PatientPrincipal } from '../portal.types';
import { PortalActivateDto } from './dto/portal-activate.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { PortalLogoutDto } from './dto/portal-logout.dto';
import { PortalRefreshDto } from './dto/portal-refresh.dto';
import { PortalJwtAuthGuard } from './guards/portal-jwt-auth.guard';
import { PortalPrincipalGuard } from './guards/portal-principal.guard';
import { PatientPortalAuthService } from './patient-portal-auth.service';

@Controller('portal/auth')
export class PatientPortalAuthController {
  constructor(private readonly authService: PatientPortalAuthService) {}

  @Post('activate')
  activate(@Body() dto: PortalActivateDto) {
    return this.authService.activate(dto);
  }

  @Post('login')
  login(@Body() dto: PortalLoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(RefreshRateLimitGuard)
  @Post('refresh')
  refresh(@Body() dto: PortalRefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(PortalJwtAuthGuard, PortalPrincipalGuard)
  @Post('logout')
  logout(
    @Request() req: { user: PatientPrincipal },
    @Body() dto: PortalLogoutDto,
  ) {
    return this.authService.logout(dto.refreshToken, req.user);
  }
}
