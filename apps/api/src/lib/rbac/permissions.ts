import { prisma } from '../prisma/client';

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
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
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
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
