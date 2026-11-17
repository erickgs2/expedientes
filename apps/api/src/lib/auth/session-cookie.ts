import type { NextResponse } from 'next/server';
import { issueToken } from './jwt';
import { AUTH_COOKIE_NAME } from './session';

/** Starts a session: the signed token in an httpOnly cookie, for the clinic it acts for. */
export function setSessionCookie(
  response: NextResponse,
  user: { id: string; email: string },
  clinicId: string
): void {
  const token = issueToken({ sub: user.id, email: user.email, cid: clinicId });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
}
