import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from '../../../common/config/jwt.config';
import { PatientJwtPayload, PatientPrincipal } from '../../portal.types';
import { toPatientPrincipal } from '../portal-jwt-payload.util';

@Injectable()
export class PortalJwtStrategy extends PassportStrategy(Strategy, 'portal-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  validate(payload: PatientJwtPayload): PatientPrincipal {
    return toPatientPrincipal(payload);
  }
}
