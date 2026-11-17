import { NextResponse } from 'next/server';
import type { LoginResponse } from '@expedientes/shared-types';
import { prismaUnscoped } from '../prisma/client';
import { resolveMembership } from '../rbac/permissions';
import { setCurrentClinic } from '../tenancy/context';
import { pendingLegalFor } from '../legal/legal-documents';
import { writeAuditLogSafe } from '../audit/audit-log';
import { toAuthUser } from './auth-user';
import { setSessionCookie } from './session-cookie';

/**
 * Signs a user in after a flow that has already proven who they are (a confirmed sign-up code, a
 * reset code, an accepted invitation): resolves their clinic as login does, sets the session cookie
 * and answers like POST /api/auth/login.
 */
export async function signInAs(userId: string, preferredClinicId?: string): Promise<NextResponse> {
  const membership = await resolveMembership(userId, preferredClinicId);
  setCurrentClinic(membership.clinicId);
  const user = await prismaUnscoped.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true },
  });
  const body: LoginResponse = {
    user: toAuthUser(membership, await pendingLegalFor(userId)),
  };
  const response = NextResponse.json(body);
  setSessionCookie(response, user, membership.clinicId);
  await writeAuditLogSafe({ userId, action: 'view', entity: 'Session', entityId: userId });
  return response;
}
