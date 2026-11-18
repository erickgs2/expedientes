import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../../lib/http/require-auth';
import { prisma, prismaUnscoped } from '../../../../lib/prisma/client';
import { createCheckout } from '../../../../lib/billing/checkout';
import { currentClinicId } from '../../../../lib/tenancy/context';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Starts buying Premium: answers the Stripe Checkout URL to send the owner to. Owner only. */
export const POST = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'clinic-settings', 'view');
  const owner = await prisma.membership.findFirst({ where: { userId, isOwner: true } });
  if (!owner) return apiError('FORBIDDEN', "Only the clinic's owner can buy a plan", 403);
  const { interval, method } = (await request.json()) as { interval?: string; method?: string };
  if ((interval !== 'MONTH' && interval !== 'YEAR') || (method !== 'CARD' && method !== 'OXXO')) {
    return apiError('INVALID_INPUT', 'interval must be MONTH or YEAR and method CARD or OXXO', 400);
  }
  const user = await prismaUnscoped.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const url = await createCheckout({ clinicId: currentClinicId(), ownerEmail: user.email, interval, method });
  return NextResponse.json({ url });
});
