import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma/client';
import { requireAuth } from '../../../lib/http/require-auth';
import { withApiErrors } from '../../../lib/http/with-api-errors';

/**
 * The clinic's users are its memberships. A user is a global account (one email, one password);
 * what they can do here, and whether they are active here, lives on their membership in this clinic.
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'rbac-admin', 'view');

  const memberships = await prisma.membership.findMany({
    include: { user: true, role: true },
    orderBy: { user: { fullName: 'asc' } },
  });

  return NextResponse.json({
    users: memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      fullName: m.user.fullName,
      language: m.user.language,
      active: m.active && m.user.active,
      roleId: m.roleId,
      roleName: m.role.name,
    })),
  });
});

// New users join a clinic by accepting an invitation (POST /api/invitations). Creating an account
// here with a password the owner chose let a clinic claim anyone's email, unverified.
