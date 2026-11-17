import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '../../../../lib/auth/session';
import { InactiveUserError, resolveMembership } from '../../../../lib/rbac/permissions';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(async (request: NextRequest) => {
  const session = getSessionFromRequest(request);
  if (!session) {
    return apiError('UNAUTHENTICATED', 'Not logged in', 401);
  }

  let membership;
  try {
    membership = await resolveMembership(session.sub, session.cid);
  } catch (error) {
    if (error instanceof InactiveUserError) {
      return apiError('UNAUTHENTICATED', 'Not logged in', 401);
    }
    throw error;
  }

  return NextResponse.json({
    user: {
      id: membership.userId,
      email: membership.email,
      fullName: membership.fullName,
      language: membership.language,
      roleId: membership.roleId,
      roleName: membership.roleName,
      permissions: membership.permissions,
      clinic: { id: membership.clinicId, name: membership.clinicName },
    },
  });
});
