import { prismaUnscoped } from '../prisma/client';
import { currentClinicIdOrNull, setCurrentClinic } from '../tenancy/context';

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Thrown when a still-valid JWT belongs to a user who can no longer hold a session — the row was
 * deactivated by an admin, or deleted outright, or the user no longer has an active membership in
 * any active clinic. Callers map this to 401 (not 403): the credential itself is no longer
 * acceptable, so the client must re-authenticate.
 */
export class InactiveUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InactiveUserError';
  }
}

export function checkPermission(
  grantedPermissions: string[],
  module: string,
  action: string
): void {
  if (!grantedPermissions.includes(`${module}:${action}`)) {
    throw new ForbiddenError(`Missing permission ${module}:${action}`);
  }
}

export interface ResolvedMembership {
  userId: string;
  email: string;
  fullName: string;
  language: string;
  clinicId: string;
  clinicName: string;
  roleId: string;
  roleName: string;
  isOwner: boolean;
  permissions: string[];
}

/**
 * Which clinic a user acts for, and with what permissions there. Read from the database on every
 * request, not only at login: deactivating a user or a membership, or suspending a clinic, must
 * revoke a JWT already issued, which otherwise stays valid for up to 8 hours.
 *
 * `preferredClinicId` (the session's clinic) is used when the user still holds an active membership
 * there; otherwise the user's oldest active membership in an active clinic. Uses the unscoped
 * client: no clinic is known yet, this is what decides it.
 */
export async function resolveMembership(
  userId: string,
  preferredClinicId?: string
): Promise<ResolvedMembership> {
  const user = await prismaUnscoped.user.findUnique({ where: { id: userId } });
  if (!user) throw new InactiveUserError('User account no longer exists');
  if (!user.active) throw new InactiveUserError('User account is inactive');

  const memberships = await prismaUnscoped.membership.findMany({
    where: { userId, active: true, clinic: { status: 'ACTIVE' } },
    include: {
      clinic: { select: { id: true, name: true } },
      role: { include: { permissions: { include: { permission: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const membership =
    memberships.find((m) => m.clinicId === preferredClinicId) ?? memberships[0];
  if (!membership) throw new InactiveUserError('User has no active clinic membership');

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    language: user.language,
    clinicId: membership.clinicId,
    clinicName: membership.clinic.name,
    roleId: membership.roleId,
    roleName: membership.role.name,
    isOwner: membership.isOwner,
    permissions: membership.role.permissions.map(
      (rp) => `${rp.permission.module}:${rp.permission.action}`
    ),
  };
}

/**
 * Resolves the user's membership, makes its clinic the current one for this request, and checks the
 * permission. Returns the membership.
 */
export async function authorize(
  userId: string,
  preferredClinicId: string | undefined,
  module: string,
  action: string
): Promise<ResolvedMembership> {
  const membership = await resolveMembership(userId, preferredClinicId);
  setCurrentClinic(membership.clinicId);
  checkPermission(membership.permissions, module, action);
  return membership;
}

/**
 * The user's permissions in the clinic the current request acts for (or their first clinic, before
 * one is set). For routes that check a second permission after requireAuth.
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const membership = await resolveMembership(userId, currentClinicIdOrNull() ?? undefined);
  return membership.permissions;
}
