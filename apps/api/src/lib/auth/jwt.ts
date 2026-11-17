import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  /**
   * The clinic the session acts for. Only a preference: every request re-checks in the database that
   * the user still holds an active membership there (see lib/rbac/permissions.ts). Tokens issued
   * before memberships existed lack it; those fall back to the user's first clinic.
   */
  cid?: string;
}

const TOKEN_EXPIRY = '8h';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export function issueToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getSecret()) as AuthTokenPayload;
}
