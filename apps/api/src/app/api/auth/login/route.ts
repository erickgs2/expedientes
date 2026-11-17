import { NextRequest, NextResponse } from 'next/server';
import { prismaUnscoped } from '../../../../lib/prisma/client';
import { verifyPassword } from '../../../../lib/auth/password';
import { setSessionCookie } from '../../../../lib/auth/session-cookie';
import { InactiveUserError, resolveMembership } from '../../../../lib/rbac/permissions';
import { setCurrentClinic } from '../../../../lib/tenancy/context';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';
import { toAuthUser } from '../../../../lib/auth/auth-user';
import { pendingLegalFor } from '../../../../lib/legal/legal-documents';
import {
  checkLoginAllowed,
  getClientIp,
  recordLoginFailure,
  recordLoginSuccess,
} from '../../../../lib/auth/login-throttle';

export const POST = withApiErrors(async (request: NextRequest) => {
  const { email, password } = (await request.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return apiError('INVALID_INPUT', 'Email and password are required', 400);
  }

  // Checked before the password hash is computed, so a blocked source also cannot burn CPU on bcrypt.
  const ip = getClientIp(request);
  const limit = checkLoginAllowed(ip, email);
  if (!limit.allowed) {
    const response = apiError('TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again later.', 429);
    response.headers.set('Retry-After', String(limit.retryAfterSeconds));
    return response;
  }

  // Users are global (one email, one password); no clinic is known until the membership below.
  // Emails are stored lower-cased by sign-up; older accounts may not be, so the match ignores case.
  const user = await prismaUnscoped.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
  });

  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    recordLoginFailure(ip, email);
    return apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  // A correct password with no active membership in an active clinic (deactivated everywhere, or
  // the clinic suspended) is still refused, with the same answer as a wrong password. A member of a
  // clinic now on Free gets 403 PLAN_MEMBER_INACTIVE instead (see with-api-errors): the password was
  // right, and the screen should say why they cannot enter.
  let membership;
  try {
    membership = await resolveMembership(user.id);
  } catch (error) {
    if (error instanceof InactiveUserError) {
      return apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    throw error;
  }

  recordLoginSuccess(ip, email);
  setCurrentClinic(membership.clinicId);

  const response = NextResponse.json({ user: toAuthUser(membership, await pendingLegalFor(membership.userId)) });

  setSessionCookie(response, user, membership.clinicId);

  // Successful logins only — a failed attempt has no authenticated user to attribute it to.
  await writeAuditLogSafe({ userId: user.id, action: 'view', entity: 'Session', entityId: user.id });

  return response;
});
