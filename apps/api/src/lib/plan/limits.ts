import type { PlanFeature, PlanLimitDetails, PlanQuota } from '@expedientes/shared-types';
import { PLAN_LIMITS } from '../shared/runtime';
import { prisma, prismaUnscoped } from '../prisma/client';
import { currentClinicId } from '../tenancy/context';
import { currentClinicPlan } from './clinic-plan';

/**
 * The clinic's plan does not allow this. Answered as HTTP 402 with code PLAN_LIMIT, so the web can
 * offer the upgrade instead of a generic error.
 */
export class PlanLimitError extends Error {
  constructor(readonly details: PlanLimitDetails) {
    super(`The current plan does not allow this (${details.limit})`);
    this.name = 'PlanLimitError';
  }
}

export interface ClinicUsage {
  users: number;
  treatmentTypes: number;
  storageBytes: number;
}

/**
 * What the current clinic uses of each quota. Users and treatment types count only active ones: a
 * clinic back on Free can deactivate what is over the limit to make room, and nothing is deleted.
 */
export async function currentClinicUsage(): Promise<ClinicUsage> {
  const [users, treatmentTypes, clinic] = await Promise.all([
    prisma.membership.count({ where: { active: true } }),
    prisma.treatmentType.count({ where: { active: true } }),
    prismaUnscoped.clinic.findUniqueOrThrow({
      where: { id: currentClinicId() },
      select: { storageBytes: true },
    }),
  ]);
  return { users, treatmentTypes, storageBytes: Number(clinic.storageBytes) };
}

/** Throws unless the current clinic's plan includes `feature`. */
export async function assertFeature(feature: PlanFeature): Promise<void> {
  const plan = await currentClinicPlan();
  if (!plan.features[feature]) {
    throw new PlanLimitError({ limit: feature, requiredPlan: 'PREMIUM' });
  }
}

/**
 * Throws unless the current clinic can have one more active user or treatment type. `reserved`
 * counts seats already promised but not yet taken (pending invitations).
 */
export async function assertCanAddOne(
  quota: Exclude<PlanQuota, 'storage'>,
  reserved = 0
): Promise<void> {
  const plan = await currentClinicPlan();
  const max = PLAN_LIMITS[plan.tier][quota];
  if (max === null) return;
  const current =
    quota === 'users'
      ? await prisma.membership.count({ where: { active: true } })
      : await prisma.treatmentType.count({ where: { active: true } });
  if (current + reserved >= max) {
    throw new PlanLimitError({ limit: quota, max, requiredPlan: 'PREMIUM' });
  }
}

/**
 * Throws when storing `bytes` more would put the current clinic over its storage quota. Only new
 * photos and scans are checked; nothing already stored is ever removed, and signing a consent is
 * never blocked by storage.
 */
export async function assertStorageFor(bytes: number): Promise<void> {
  const plan = await currentClinicPlan();
  const max = PLAN_LIMITS[plan.tier].storageBytes;
  const clinic = await prismaUnscoped.clinic.findUniqueOrThrow({
    where: { id: currentClinicId() },
    select: { storageBytes: true },
  });
  if (Number(clinic.storageBytes) + bytes > max) {
    throw new PlanLimitError({ limit: 'storage', max, requiredPlan: 'PREMIUM' });
  }
}
