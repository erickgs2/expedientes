import type { Prisma } from '@prisma/client';
import { prismaUnscoped } from '../prisma/client';

export interface PlatformActionTarget {
  type?: string;
  id?: string;
}

/** Records an action taken from the platform portal. Never fails the action itself. */
export async function logPlatformAction(
  adminId: string,
  action: string,
  target: PlatformActionTarget = {},
  details?: Prisma.InputJsonValue,
  ip?: string
): Promise<void> {
  try {
    await prismaUnscoped.platformAuditLog.create({
      data: {
        adminId,
        action,
        targetType: target.type ?? null,
        targetId: target.id ?? null,
        details,
        ip: ip && ip !== 'unknown' ? ip : null,
      },
    });
  } catch (error) {
    console.error('Could not write the platform audit log', error);
  }
}
