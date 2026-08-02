import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { getUserIdFromRequest } from '../../../../lib/auth/session';
import { getUserPermissions } from '../../../../lib/rbac/permissions';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return apiError('UNAUTHENTICATED', 'Not logged in', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user || !user.active) {
    return apiError('UNAUTHENTICATED', 'Not logged in', 401);
  }

  const permissions = await getUserPermissions(user.id);

  return NextResponse.json({
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
});
