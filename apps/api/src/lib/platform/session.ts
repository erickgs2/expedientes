import jwt from 'jsonwebtoken';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * The platform portal's session, apart from the clinics' in every way: its own cookie (sent only to
 * /api/plataforma), its own signing key (derived, so a clinic token can never pass for one) and an
 * audience claim. Signing in takes two steps; between them the cookie carries a short-lived
 * "pending" stage that only the TOTP endpoints accept.
 */
export const PLATFORM_COOKIE = 'medcloud_platform';
const COOKIE_PATH = '/api/plataforma';

export type PlatformStage = 'totp' | 'setup' | 'full';

export interface PlatformTokenPayload {
  sub: string;
  stage: PlatformStage;
}

const FULL_SESSION_SECONDS = 4 * 60 * 60;
const PENDING_SECONDS = 10 * 60;

function secret(): string {
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET is not configured');
  return `${base}:platform`;
}

export function setPlatformCookie(response: NextResponse, adminId: string, stage: PlatformStage): void {
  const maxAge = stage === 'full' ? FULL_SESSION_SECONDS : PENDING_SECONDS;
  const token = jwt.sign({ stage }, secret(), {
    subject: adminId,
    audience: 'platform',
    expiresIn: maxAge,
  });
  response.cookies.set(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge,
  });
}

export function clearPlatformCookie(response: NextResponse): void {
  response.cookies.set(PLATFORM_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 });
}

export function readPlatformSession(request: NextRequest): PlatformTokenPayload | null {
  const token = request.cookies.get(PLATFORM_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret(), { audience: 'platform' }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || !['totp', 'setup', 'full'].includes(payload['stage'])) return null;
    return { sub: payload.sub, stage: payload['stage'] as PlatformStage };
  } catch {
    return null;
  }
}
