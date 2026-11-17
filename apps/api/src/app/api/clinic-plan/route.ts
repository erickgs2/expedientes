import { NextRequest, NextResponse } from 'next/server';
import type { ClinicPlanDetails } from '@expedientes/shared-types';
import { PLAN_LIMITS } from '../../../lib/shared/runtime';
import { prismaUnscoped } from '../../../lib/prisma/client';
import { currentClinicPlan, currentPlanPrice } from '../../../lib/plan/clinic-plan';
import { currentClinicUsage } from '../../../lib/plan/limits';
import { currentClinicId } from '../../../lib/tenancy/context';
import { requireAuth } from '../../../lib/http/require-auth';
import { withApiErrors } from '../../../lib/http/with-api-errors';

/**
 * The clinic's plan: where it comes from and until when, what it allows, what the clinic uses of
 * each limit, and the current Premium price. Backs the Plan screen.
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'clinic-settings', 'view');

  const [plan, usage, price, subscription] = await Promise.all([
    currentClinicPlan(),
    currentClinicUsage(),
    currentPlanPrice(),
    prismaUnscoped.subscription.findUnique({ where: { clinicId: currentClinicId() } }),
  ]);

  const body: ClinicPlanDetails = {
    ...plan,
    limits: PLAN_LIMITS[plan.tier],
    usage,
    subscription: subscription
      ? {
          status: subscription.status,
          interval: subscription.interval,
          method: subscription.method,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        }
      : null,
    price,
  };
  return NextResponse.json(body);
});
