import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { verifyPassword } from '../../../../lib/auth/password';
import { issueToken } from '../../../../lib/auth/jwt';
import { AUTH_COOKIE_NAME } from '../../../../lib/auth/session';
import { getUserPermissions } from '../../../../lib/rbac/permissions';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const POST = withApiErrors(async (request: NextRequest) => {
  const { email, password } = (await request.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return apiError('INVALID_INPUT', 'Email and password are required', 400);
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const token = issueToken({ sub: user.id, email: user.email });
  const permissions = await getUserPermissions(user.id);

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      language: user.language,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions,
    },
  });

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });

  // Successful logins only — a failed attempt has no authenticated user to attribute it to.
  await writeAuditLogSafe({ userId: user.id, action: 'view', entity: 'Session', entityId: user.id });

  return response;
});
