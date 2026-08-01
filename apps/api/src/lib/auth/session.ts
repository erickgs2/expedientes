import type { NextRequest } from 'next/server';
import { verifyToken } from './jwt';

export const AUTH_COOKIE_NAME = 'auth_token';

export function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return verifyToken(token).sub;
  } catch {
    return null;
  }
}
