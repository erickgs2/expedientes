import { NextRequest, NextResponse } from 'next/server';
import type { PlatformLoginResponse } from '@expedientes/shared-types';
import { prismaUnscoped } from '../../../../../lib/prisma/client';
import { verifyPassword } from '../../../../../lib/auth/password';
import { getClientIp } from '../../../../../lib/auth/login-throttle';
import { createFailureLimiter } from '../../../../../lib/auth/failure-limiter';
import { setPlatformCookie } from '../../../../../lib/platform/session';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/** Stricter than clinic sign-in: this account can see and change every clinic's plan. */
const failures = createFailureLimiter({ maxFailures: 5, windowMs: 30 * 60_000 });

/**
 * First step of the platform sign-in: email and password. Answers which second step follows
 * (enrolling an authenticator the first time, a TOTP code after that) with a short-lived cookie
 * that only those steps accept.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const ip = getClientIp(request);
  const check = failures.check(ip);
  if (!check.allowed) {
    const response = apiError('TOO_MANY_ATTEMPTS', 'Too many attempts. Try again later.', 429);
    response.headers.set('Retry-After', String(check.retryAfterSeconds));
    return response;
  }
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  const admin =
    typeof email === 'string'
      ? await prismaUnscoped.platformAdmin.findFirst({
          where: { email: { equals: email.trim(), mode: 'insensitive' } },
        })
      : null;
  if (!admin || !admin.active || typeof password !== 'string' || !(await verifyPassword(password, admin.passwordHash))) {
    failures.recordFailure(ip);
    return apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  const next: PlatformLoginResponse['next'] = admin.totpEnabledAt ? 'totp' : 'setup';
  const response = NextResponse.json({ next } satisfies PlatformLoginResponse);
  setPlatformCookie(response, admin.id, next);
  return response;
});
