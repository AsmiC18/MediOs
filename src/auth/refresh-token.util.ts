import { createHash, randomBytes } from 'crypto';

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}
