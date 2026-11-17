import type { Prisma } from '@prisma/client';
import { DEFAULT_DECLARATION_AFTER, DEFAULT_DECLARATION_BEFORE } from '../shared/runtime';

export interface NewClinicInput {
  clinicName: string;
  phone: string;
  ownerUserId: string;
}

/**
 * Creates a clinic ready to use, inside the caller's transaction: the clinic, its settings (named
 * after it, with the default consent declarations), an Admin role holding every permission, and the
 * owner's membership. Starts on Free: no subscription and no grant.
 *
 * Runs on the unscoped transaction client, before any clinic context exists, so every tenant row is
 * given its clinicId explicitly.
 */
export async function createClinicWithOwner(
  tx: Prisma.TransactionClient,
  input: NewClinicInput
): Promise<{ clinicId: string; roleId: string }> {
  const clinic = await tx.clinic.create({
    data: { name: input.clinicName, phone: input.phone, storageCountedAt: new Date() },
    select: { id: true },
  });
  const permissions = await tx.permission.findMany({ select: { id: true } });
  const role = await tx.role.create({
    data: {
      clinicId: clinic.id,
      name: 'Admin',
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
    select: { id: true },
  });
  await tx.clinicSettings.create({
    data: {
      clinicId: clinic.id,
      clinicName: input.clinicName,
      defaultPlace: '',
      doctorTitle: 'DRA.',
      doctorName: '',
      doctorLicense: '',
      declarationBefore: DEFAULT_DECLARATION_BEFORE,
      declarationAfter: DEFAULT_DECLARATION_AFTER,
    },
  });
  await tx.membership.create({
    data: { userId: input.ownerUserId, clinicId: clinic.id, roleId: role.id, isOwner: true },
  });
  return { clinicId: clinic.id, roleId: role.id };
}
