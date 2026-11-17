import { NextRequest, NextResponse } from 'next/server';
import type { PlatformAdminView } from '@expedientes/shared-types';
import { prismaUnscoped } from '../../../../../lib/prisma/client';
import { requirePlatformAdmin } from '../../../../../lib/platform/require-admin';
import { verifyTotp } from '../../../../../lib/platform/totp';
import { openSecret } from '../../../../../lib/platform/secret-box';
import { setPlatformCookie } from '../../../../../lib/platform/session';
import { logPlatformAction } from '../../../../../lib/platform/audit';
import { getClientIp } from '../../../../../lib/auth/login-throttle';
import { createFailureLimiter } from '../../../../../lib/auth/failure-limiter';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const failures = createFailureLimiter({ maxFailures: 5, windowMs: 15 * 60_000 });

/**
 * Second step: a code from the authenticator. During enrolment the first valid code also turns the
 * second factor on. Either way it upgrades the cookie to a full session.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const { admin, stage } = await requirePlatformAdmin(request, ['totp', 'setup']);
  const ip = getClientIp(request);
  const key = `${admin.id}|${ip}`;
  if (!failures.check(key).allowed) return apiError('TOO_MANY_ATTEMPTS', 'Too many attempts. Try again later.', 429);

  const { code } = (await request.json()) as { code?: string };
  const step =
    admin.totpSecret && typeof code === 'string'
      ? verifyTotp(openSecret(admin.totpSecret), code.trim(), new Date(), admin.totpLastStep)
      : null;
  if (step === null) {
    failures.recordFailure(key);
    return apiError('CODE_INVALID', 'The code is not correct', 400);
  }
  failures.reset(key);
  await prismaUnscoped.platformAdmin.update({
    where: { id: admin.id },
    data: {
      totpLastStep: step,
      lastLoginAt: new Date(),
      ...(stage === 'setup' ? { totpEnabledAt: new Date() } : {}),
    },
  });
  await logPlatformAction(admin.id, stage === 'setup' ? 'session.enrol' : 'session.login', {}, undefined, ip);
  const response = NextResponse.json({ admin: { email: admin.email, fullName: admin.fullName } satisfies PlatformAdminView });
  setPlatformCookie(response, admin.id, 'full');
  return response;
});
