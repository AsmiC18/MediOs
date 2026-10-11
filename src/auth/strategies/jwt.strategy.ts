import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolveJwtSecret } from '../../common/config/jwt.config';
import { StaffJwtPayload, toStaffJwtUser } from '../staff-jwt-payload.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  async validate(payload: StaffJwtPayload) {
    return toStaffJwtUser(payload);
  }
}
