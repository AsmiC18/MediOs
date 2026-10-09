import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verify, JwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';

export interface Identity {
  sub: string;
  hospitalId: string;
  branchId: string;
  permissions: string[];
}
export type StaffRequest = Request & { identity: Identity };
export const Permission = (permission: string) => SetMetadata('permission', permission);

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const required = this.reflector.get<string>('permission', context.getHandler());
    if (!required) throw new ForbiddenException('Permission not configured');
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) throw new UnauthorizedException();
    let claims: JwtPayload;
    try {
      claims = verify(token, process.env.JWT_SECRET!, {
        algorithms: ['HS256'], issuer: process.env.JWT_ISSUER!, audience: process.env.JWT_AUDIENCE!,
      }) as JwtPayload;
      if (!claims || typeof claims !== 'object' || typeof claims.exp !== 'number' ||
          ![claims.sub, claims.hospitalId, claims.branchId].every(v => typeof v === 'string' && v.length > 0) ||
          !Array.isArray(claims.permissions) || !claims.permissions.every((v: unknown) => typeof v === 'string')) {
        throw new Error('Invalid claims');
      }
    } catch { throw new UnauthorizedException(); }
    if (!claims.permissions.includes(required)) throw new ForbiddenException();
    request.identity = claims as Identity;
    return true;
  }
}
