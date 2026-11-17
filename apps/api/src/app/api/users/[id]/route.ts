import { NextRequest, NextResponse } from 'next/server';
import { prisma, prismaUnscoped } from '../../../../lib/prisma/client';
import { hashPassword } from '../../../../lib/auth/password';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { assertCanAddOne } from '../../../../lib/plan/limits';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';
import { assertInClinic } from '../../../../lib/tenancy/assert';
import { currentClinicId } from '../../../../lib/tenancy/context';

export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'rbac-admin', 'edit');

    const { id } = await params;

    const body = (await request.json()) as {
      fullName?: string;
      roleId?: string;
      language?: string;
      active?: boolean;
      newPassword?: string;
    };

    // Only users who are members of this clinic can be edited from it.
    const membership = await prisma.membership.findFirst({ where: { userId: id } });
    if (!membership) return apiError('NOT_FOUND', 'User not found', 404);

    // Role and active status belong to the membership: they change only what the user can do here.
    const membershipData: { roleId?: string; active?: boolean } = {};
    if (body.roleId !== undefined) {
      await assertInClinic('role', [body.roleId]);
      membershipData.roleId = body.roleId;
    }
    if (body.active !== undefined) {
      // The owner holds the clinic's plan and is the one user Free keeps; deactivating them would
      // lock the whole clinic out.
      if (membership.isOwner && body.active === false) {
        return apiError('INVALID_INPUT', "The clinic's owner cannot be deactivated", 400);
      }
      if (body.active && !membership.active) await assertCanAddOne('users');
      membershipData.active = body.active;
    }

    // Name, language and password belong to the person's account, shared by every clinic they
    // work in. A clinic may change them only for a user who belongs to no other clinic; otherwise one
    // clinic could lock a doctor out of another by resetting their password.
    const userData: { fullName?: string; language?: string; passwordHash?: string } = {};
    if (body.fullName !== undefined) userData.fullName = body.fullName;
    if (body.language !== undefined) userData.language = body.language;
    if (body.newPassword) userData.passwordHash = await hashPassword(body.newPassword);

    if (Object.keys(userData).length > 0) {
      const otherClinics = await prismaUnscoped.membership.count({
        where: { userId: id, clinicId: { not: currentClinicId() } },
      });
      if (otherClinics > 0) {
        return apiError(
          'FORBIDDEN',
          'This user also belongs to another clinic; only they can change their account details',
          403
        );
      }
    }

    if (Object.keys(membershipData).length > 0) {
      await prisma.membership.update({ where: { id: membership.id }, data: membershipData });
    }
    if (Object.keys(userData).length > 0) {
      await prismaUnscoped.user.update({ where: { id }, data: userData });
    }
    await writeAuditLogSafe({ userId, action: 'update', entity: 'User', entityId: id });

    return NextResponse.json({ ok: true });
  }
);
