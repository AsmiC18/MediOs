import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { PassportModule } from '@nestjs/passport';

import { AuditModule } from '../audit/audit.module';

import { CommonModule } from '../common/common.module';

import { resolveJwtAccessTtl } from './auth-token.config';

import { resolveJwtSecret } from '../common/config/jwt.config';

import { AuthController } from './auth.controller';

import { AuthSessionService } from './auth-session.service';

import { AuthService } from './auth.service';

import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';

import { NonProductionGuard } from './guards/non-production.guard';

import { PermissionsGuard } from './guards/permissions.guard';

import { RefreshRateLimitGuard } from './guards/refresh-rate-limit.guard';

import { RegistrationRateLimitGuard } from './guards/registration-rate-limit.guard';

import { LoginRateLimitService } from './login-rate-limit.service';

import { RefreshRateLimitService } from './refresh-rate-limit.service';

import { RegistrationRateLimitService } from './registration-rate-limit.service';

import { JwtStrategy } from './strategies/jwt.strategy';



@Module({

  imports: [

    CommonModule,

    AuditModule,

    PassportModule.register({

      defaultStrategy: 'jwt',

    }),

    JwtModule.register({

      secret: resolveJwtSecret(),

      signOptions: {

        expiresIn: resolveJwtAccessTtl() as `${number}${'s' | 'm' | 'h' | 'd'}`,

      },

    }),

  ],

  controllers: [AuthController],

  providers: [

    AuthService,

    AuthSessionService,

    JwtStrategy,

    PermissionsGuard,

    NonProductionGuard,

    LoginRateLimitService,

    LoginRateLimitGuard,

    RefreshRateLimitService,

    RefreshRateLimitGuard,

    RegistrationRateLimitService,

    RegistrationRateLimitGuard,

  ],

  exports: [AuthService, PermissionsGuard, JwtModule],

})

export class AuthModule {}


