import { NextRequest, NextResponse } from 'next/server';
import { prisma, prismaUnscoped } from '../../../lib/prisma/client';
import { hashPassword } from '../../../lib/auth/password';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { assertCanAddOne } from '../../../lib/plan/limits';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';
import { assertInClinic } from '../../../lib/tenancy/assert';
import { currentClinicId } from '../../../lib/tenancy/context';

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

export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'rbac-admin', 'create');

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    fullName?: string;
    roleId?: string;
    language?: string;
  };

  if (!body.email || !body.password || !body.fullName || !body.roleId) {
    return apiError('INVALID_INPUT', 'email, password, fullName, and roleId are required', 400);
  }
  await assertInClinic('role', [body.roleId]);
  // Free allows one user, the owner; Premium has no cap.
  await assertCanAddOne('users');

  // The account and its membership are created together, or not at all. An email that already has
  // an account (in this or another clinic) is refused by the unique email: adding an existing
  // person to a second clinic is done by invitation, not by setting their password here.
  const created = await prismaUnscoped.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: body.email as string,
        passwordHash: await hashPassword(body.password as string),
        fullName: body.fullName as string,
        language: body.language ?? 'es',
      },
    });
    await tx.membership.create({
      data: { userId: user.id, clinicId: currentClinicId(), roleId: body.roleId as string },
    });
    return user;
  });

  await writeAuditLogSafe({ userId, action: 'create', entity: 'User', entityId: created.id });

  return NextResponse.json({ id: created.id }, { status: 201 });
});
