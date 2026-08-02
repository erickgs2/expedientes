import { prisma } from '../prisma/client';

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Thrown when a still-valid JWT belongs to a user who can no longer hold a session — the row was
 * deactivated by an admin, or deleted outright. Callers map this to 401 (not 403): the credential
 * itself is no longer acceptable, so the client must re-authenticate.
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

export async function getUserPermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  // Re-checked on every request, not only at login: deactivating (or deleting) a user must revoke
  // the JWT already issued to them, which otherwise stays valid for up to 8 hours.
  if (!user) {
    throw new InactiveUserError('User account no longer exists');
  }
  if (!user.active) {
    throw new InactiveUserError('User account is inactive');
  }
  return user.role.permissions.map((rp) => `${rp.permission.module}:${rp.permission.action}`);
}

export async function requirePermission(
  userId: string,
  module: string,
  action: string
): Promise<void> {
  const granted = await getUserPermissions(userId);
  checkPermission(granted, module, action);
}
