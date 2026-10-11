import {

  Body,

  Controller,

  Headers,

  Post,

  Req,

  Request,

  UseGuards,

} from '@nestjs/common';

import { resolveClientIp } from './client-ip.util';

import { RequirePermissions } from './decorators/permissions.decorator';

import { AuthService } from './auth.service';

import { LoginDto } from './dto/login.dto';

import { LogoutDto } from './dto/logout.dto';

import { RefreshTokenDto } from './dto/refresh-token.dto';

import { RegisterDto } from './dto/register.dto';

import { JwtAuthGuard } from './guards/jwt-auth.guard';

import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';

import { NonProductionGuard } from './guards/non-production.guard';

import { PermissionsGuard } from './guards/permissions.guard';

import { RefreshRateLimitGuard } from './guards/refresh-rate-limit.guard';

import { RegistrationRateLimitGuard } from './guards/registration-rate-limit.guard';



@Controller('auth')

export class AuthController {

  constructor(private readonly authService: AuthService) {}



  @UseGuards(RegistrationRateLimitGuard)

  @Post('register')

  register(

    @Body() dto: RegisterDto,

    @Headers('x-registration-bootstrap-secret') bootstrapSecret?: string,

  ) {

    return this.authService.register(dto, bootstrapSecret);

  }



  @UseGuards(LoginRateLimitGuard)

  @Post('login')

  login(

    @Body() dto: LoginDto,

    @Req()

    req: {

      ip?: string;

      headers?: Record<string, string | string[] | undefined>;

    },

  ) {

    return this.authService.login(dto, resolveClientIp(req));

  }



  @UseGuards(RefreshRateLimitGuard)

  @Post('refresh')

  refresh(

    @Body() dto: RefreshTokenDto,

    @Req()

    req: {

      ip?: string;

      headers?: Record<string, string | string[] | undefined>;

    },

  ) {

    return this.authService.refresh(dto.refreshToken, resolveClientIp(req));

  }



  @UseGuards(JwtAuthGuard)

  @Post('logout')

  logout(

    @Body() dto: LogoutDto,

    @Request()

    req: {

      user: {

        sub: string;

        hospitalId: string;

        branchId?: string | null;

      };

    },

  ) {

    return this.authService.logout(dto.refreshToken, req.user);

  }



  @UseGuards(NonProductionGuard, JwtAuthGuard, PermissionsGuard)

  @RequirePermissions('patients:read')

  @Post('test')

  test(@Request() req: any) {

    return {

      message: 'JWT authentication and permission check successful',

      user: req.user,

    };

  }

}


