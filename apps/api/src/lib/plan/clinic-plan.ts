import type { ClinicPlanSummary, PlanPriceSummary } from '@expedientes/shared-types';
import { prismaUnscoped } from '../prisma/client';
import { currentClinicId, requestMemo } from '../tenancy/context';
import { resolveEffectivePlan } from './effective-plan';

/**
 * A clinic's effective plan, read from its subscription and grants. Subscription and PlanGrant are
 * platform-owned rows (see PLATFORM_MODELS), so this uses the unscoped client with an explicit
 * clinic id.
 */
export async function loadClinicPlan(clinicId: string, now = new Date()): Promise<ClinicPlanSummary> {
  const [subscription, grants] = await Promise.all([
    prismaUnscoped.subscription.findUnique({ where: { clinicId } }),
    prismaUnscoped.planGrant.findMany({ where: { clinicId, revokedAt: null, endsAt: { gt: now } } }),
  ]);
  return resolveEffectivePlan(subscription, grants, now);
}

/** The effective plan of the clinic this request acts for, read once per request. */
export function currentClinicPlan(): Promise<ClinicPlanSummary> {
  const clinicId = currentClinicId();
  return requestMemo(`plan:${clinicId}`, () => loadClinicPlan(clinicId));
}

/** The Premium price in force: the latest version whose start has passed. */
export async function currentPlanPrice(now = new Date()): Promise<PlanPriceSummary | null> {
  const price = await prismaUnscoped.planPrice.findFirst({
    where: { effectiveFrom: { lte: now } },
    orderBy: { effectiveFrom: 'desc' },
  });
  return price
    ? {
        monthlyCents: price.monthlyCents,
        annualCents: price.annualCents,
        annualDiscountPercent: price.annualDiscountPercent,
      }
    : null;
}
